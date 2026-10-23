/**
 * Sonda de duración de audio sin dependencias (reemplaza a `mutagen`).
 *
 * El import por ZIP necesita saber si el archivo es audio REAL y cuánto dura.
 * Python lo resolvía con `mutagen`; en el Worker usamos un parser mínimo que
 * camina los frames de MP3 (MPEG Layer III) y de ADTS AAC, los mismos dos
 * formatos que acepta el import. Alcance deliberado:
 *   - MP3: saltea el tag ID3v2 si está y camina headers de frame MPEG1/2/2.5
 *     Layer III. Otros layers (I/II) se consideran no reconocidos (un `.mp3`
 *     real es Layer III).
 *   - AAC: ADTS (con o sin el flag de CRC), frames de 1024 samples.
 *
 * Igual que `mutagen`, exige DOS frames consecutivos válidos para reconocer el
 * archivo: un header suelto en bytes arbitrarios no alcanza (los MP3 de verdad
 * tienen miles de frames).
 */

export interface AudioProbe {
  /** Duración en segundos enteros (`max(1, round(...))`), null si no se pudo. */
  durationSeconds: number | null;
  /** `false` = los bytes no son un MP3/ADTS parseable (Python: mutagen falla). */
  recognized: boolean;
}

/** Frames mínimos para considerar el archivo audio válido (como mutagen). */
const MIN_FRAMES = 2;

/** Tope de frames a caminar: corta un archivo patológico sin colgar el Worker. */
const MAX_FRAMES = 500_000;

const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1,
] as const;

const MPEG2_LAYER3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1,
] as const;

const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, -1] as const;
const MPEG2_SAMPLE_RATES = [22050, 24000, 16000, -1] as const;
const MPEG25_SAMPLE_RATES = [11025, 12000, 8000, -1] as const;

const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350, -1, -1, -1,
] as const;

/** Samples por frame de AAC (ADTS). */
const ADTS_SAMPLES_PER_FRAME = 1024;

interface Mp3Frame {
  length: number;
  sampleRate: number;
  samples: number;
}

/**
 * Lee el header de un frame MP3 Layer III.
 * `null` = no hay sync o los valores son reservados/ inválidos.
 */
function readMp3Frame(bytes: Uint8Array, offset: number): Mp3Frame | null {
  if (offset + 4 > bytes.length) return null;

  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;

  // Sync de 11 bits.
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const version = (b1 >> 3) & 0b11;
  const layer = (b1 >> 1) & 0b11;
  // 1 = reserved version, 0 = reserved layer; solo Layer III (01).
  if (version === 1 || layer !== 1) return null;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0b11;
  const padding = (b2 >> 1) & 1;

  const isMpeg1 = version === 3;
  const bitrate = isMpeg1
    ? MPEG1_LAYER3_BITRATES[bitrateIndex]
    : MPEG2_LAYER3_BITRATES[bitrateIndex];
  // `free` (0) y `bad` (-1) no permiten calcular la duración del frame.
  if (bitrate === undefined || bitrate <= 0) return null;

  const sampleRates = isMpeg1
    ? MPEG1_SAMPLE_RATES
    : version === 2
      ? MPEG2_SAMPLE_RATES
      : MPEG25_SAMPLE_RATES;
  const sampleRate = sampleRates[sampleRateIndex];
  if (sampleRate === undefined || sampleRate <= 0) return null;

  // MPEG1 Layer III: 1152 samples y 144 de factor; MPEG2/2.5: 576 y 72.
  const samples = isMpeg1 ? 1152 : 576;
  const factor = isMpeg1 ? 144 : 72;
  const length = Math.floor((factor * bitrate * 1000) / sampleRate) + padding;

  if (length < 4) return null;
  return { length, sampleRate, samples };
}

/** Offset del primer frame MP3, salteando un tag ID3v2 si está presente. */
function skipId3v2(bytes: Uint8Array): number {
  if (bytes.length < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0; // "ID3"

  // Tamaño syncsafe de 4 bytes (7 bits útiles cada uno) en los bytes 6..9.
  const size =
    ((bytes[6]! & 0x7f) << 21) |
    ((bytes[7]! & 0x7f) << 14) |
    ((bytes[8]! & 0x7f) << 7) |
    (bytes[9]! & 0x7f);
  const hasFooter = (bytes[5]! & 0x10) !== 0;
  const total = 10 + size + (hasFooter ? 10 : 0);
  return total < bytes.length ? total : 0;
}

function probeMp3(bytes: Uint8Array): AudioProbe {
  let offset = skipId3v2(bytes);
  let frames = 0;
  let seconds = 0;

  while (offset < bytes.length && frames < MAX_FRAMES) {
    const frame = readMp3Frame(bytes, offset);
    if (!frame) break;
    frames += 1;
    seconds += frame.samples / frame.sampleRate;
    offset += frame.length;
  }

  return toProbe(seconds, frames);
}

function probeAdts(bytes: Uint8Array): AudioProbe {
  let offset = 0;
  let frames = 0;
  let seconds = 0;

  while (offset < bytes.length && frames < MAX_FRAMES) {
    // Sync de 12 bits: 0xFFF.
    if (offset + 7 > bytes.length) break;
    if (bytes[offset] !== 0xff || (bytes[offset + 1]! & 0xf0) !== 0xf0) break;

    const sampleRateIndex = (bytes[offset + 2]! >> 2) & 0x0f;
    const sampleRate = ADTS_SAMPLE_RATES[sampleRateIndex];
    if (sampleRate === undefined || sampleRate <= 0) break;

    // Longitud del frame (13 bits) repartida entre los bytes 3..5.
    const length =
      ((bytes[offset + 3]! & 0x03) << 11) |
      (bytes[offset + 4]! << 3) |
      (bytes[offset + 5]! >> 5);
    if (length < 7) break;

    frames += 1;
    seconds += ADTS_SAMPLES_PER_FRAME / sampleRate;
    offset += length;
  }

  return toProbe(seconds, frames);
}

function toProbe(seconds: number, frames: number): AudioProbe {
  if (frames < MIN_FRAMES || !Number.isFinite(seconds)) {
    return { durationSeconds: null, recognized: false };
  }
  return {
    durationSeconds: Math.max(1, Math.round(seconds)),
    recognized: true,
  };
}

/**
 * `probeAudio(bytes)` -> duración + si es audio parseable.
 * Prueba MP3 y después ADTS AAC (los dos formatos del import).
 */
export function probeAudio(bytes: Uint8Array): AudioProbe {
  const mp3 = probeMp3(bytes);
  if (mp3.recognized) return mp3;
  return probeAdts(bytes);
}
