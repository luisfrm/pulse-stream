/**
 * Sonda de duración de audio sin dependencias (reemplaza a `mutagen`).
 *
 * El import por ZIP necesita saber si el archivo es audio REAL y cuánto dura.
 * Python lo resolvía con `mutagen`; en el Worker usamos un parser mínimo que
 * camina los frames de MP3 (MPEG Layer III) y de ADTS AAC, más el contenedor
 * MP4 de los M4A. Alcance deliberado:
 *   - MP3: saltea el tag ID3v2 si está y camina headers de frame MPEG1/2/2.5
 *     Layer III. Otros layers (I/II) se consideran no reconocidos (un `.mp3`
 *     real es Layer III).
 *   - AAC: ADTS (con o sin el flag de CRC), frames de 1024 samples.
 *   - M4A: MP4 con una caja `ftyp` en el top level (no necesariamente la
 *     primera: mutagen camina desde 0) y AL MENOS UN track de audio
 *     (`moov/trak/mdia/hdlr` con handler `soun`). Un MP4 sin pista de audio
 *     se rechaza. La duración sale del `mdhd` de ESE track (`duration /
 *     timescale`, igual que `MP4Info.load`); el `mvhd` no se usa porque
 *     mutagen solo lo consulta cuando no hay track `soun`, y ese caso ya se
 *     rechaza.
 *
 * El redondeo imita `round()` de Python (half-to-even: 2.5 → 2, 3.5 → 4);
 * `Math.round` redondearía siempre hacia arriba.
 *
 * Igual que `mutagen`, exige DOS frames consecutivos válidos para reconocer
 * MP3/ADTS: un header suelto en bytes arbitrarios no alcanza (los MP3 de
 * verdad tienen miles de frames).
 */

export interface AudioProbe {
  /** Duración en segundos enteros (`max(1, round(...))` de Python), null si
   * el archivo declara 0 o no se pudo leer. */
  durationSeconds: number | null;
  /** `false` = los bytes no son un MP3/ADTS/M4A parseable (Python: mutagen falla). */
  recognized: boolean;
}

/** Frames mínimos para considerar el archivo audio válido (como mutagen). */
const MIN_FRAMES = 2;

/** Tope de frames a caminar: corta un archivo patológico sin colgar el Worker. */
const MAX_FRAMES = 500_000;

/** Tope de cajas MP4 a recorrer (evita listas patológicas de boxes). */
const MAX_BOXES = 64;

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

/**
 * `round()` de Python: half-to-even (`2.5 → 2`, `3.5 → 4`).
 *
 * `Math.round` redondea siempre hacia arriba (`2.5 → 3`). El caso `.5` es
 * alcanzable porque la duración de un MP4 es `duration / timescale`
 * (2500 / 1000 = 2.5). Para negativos replica igual: `floor` + paridad.
 */
function pythonRound(value: number): number {
  const floored = Math.floor(value);
  const diff = value - floored;
  if (diff < 0.5) return floored;
  if (diff > 0.5) return floored + 1;
  return floored % 2 === 0 ? floored : floored + 1;
}

function notRecognized(): AudioProbe {
  return { durationSeconds: null, recognized: false };
}

function toProbe(seconds: number, frames: number): AudioProbe {
  if (frames < MIN_FRAMES || !Number.isFinite(seconds)) {
    return notRecognized();
  }
  return {
    durationSeconds: Math.max(1, pythonRound(seconds)),
    recognized: true,
  };
}

interface Mp4Box {
  /** Tipo de 4 caracteres ASCII (`ftyp`, `moov`, `mvhd`…). */
  type: string;
  /** Offset del payload (después del header de 8/16 bytes). */
  start: number;
  /** Offset del final de la caja. */
  end: number;
}

/**
 * Lee el header de una caja MP4 en `offset`.
 *
 * `null` = no hay caja válida que entre en `end`. Soporta tamaño de 32 bits,
 * `size = 1` (largesize de 64 bits) y `size = 0` (hasta el final del padre).
 */
function readMp4Box(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  end: number,
): Mp4Box | null {
  if (offset + 8 > end) return null;

  let size = view.getUint32(offset);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > end) return null;
    const large = view.getBigUint64(offset + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    header = 16;
  } else if (size === 0) {
    size = end - offset;
  }

  if (size < header || offset + size > end) return null;

  const type = String.fromCharCode(
    bytes[offset + 4]!,
    bytes[offset + 5]!,
    bytes[offset + 6]!,
    bytes[offset + 7]!,
  );
  return { type, start: offset + header, end: offset + size };
}

/** Primera caja de tipo `type` dentro de `[start, end)`; `null` si no está. */
function findMp4Box(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  type: string,
): Mp4Box | null {
  let offset = start;
  for (let boxes = 0; offset < end && boxes < MAX_BOXES; boxes += 1) {
    const box = readMp4Box(bytes, view, offset, end);
    if (!box) return null;
    if (box.type === type) return box;
    offset = box.end;
  }
  return null;
}

/** Todas las cajas de tipo `type` dentro de `[start, end)`. */
function findMp4Boxes(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  type: string,
): Mp4Box[] {
  const found: Mp4Box[] = [];
  let offset = start;
  for (let boxes = 0; offset < end && boxes < MAX_BOXES; boxes += 1) {
    const box = readMp4Box(bytes, view, offset, end);
    if (!box) break;
    if (box.type === type) found.push(box);
    offset = box.end;
  }
  return found;
}

/**
 * `true` si el `trak` declara un handler de audio: `mdia/hdlr` con `soun` en
 * los bytes 8..12 del payload (mismo criterio que `mutagen.mp4.MP4Info.load`).
 *
 * Desviación conocida (caso exótico): si el `hdlr` está truncado mutagen
 * aborta el archivo entero, mientras que acá se salta al próximo `trak`.
 */
function isMp4AudioTrak(
  bytes: Uint8Array,
  view: DataView,
  trak: Mp4Box,
): boolean {
  const mdia = findMp4Box(bytes, view, trak.start, trak.end, "mdia");
  if (!mdia) return false;
  const hdlr = findMp4Box(bytes, view, mdia.start, mdia.end, "hdlr");
  // `hdlr` es un full atom: version+flags (4), pre_defined (4) y
  // handler type (4) → el handler vive en los bytes 8..12 del payload.
  if (!hdlr || hdlr.start + 12 > hdlr.end) return false;
  return (
    bytes[hdlr.start + 8]! === 0x73 && // s
    bytes[hdlr.start + 9]! === 0x6f && // o
    bytes[hdlr.start + 10]! === 0x75 && // u
    bytes[hdlr.start + 11]! === 0x6e // n
  );
}

interface Mp4TimeHeader {
  timescale: number;
  duration: number;
  /** `false` si la versión del full atom no es 0 ni 1. */
  valid: boolean;
}

/**
 * Lee timescale + duration de un full atom `mvhd`/`mdhd`:
 * v0 → timescale `+12` y duration `+16` (32 bits);
 * v1 → timescale `+20` y duration `+24` (64 bits).
 */
function readMp4TimeHeader(
  bytes: Uint8Array,
  view: DataView,
  box: Mp4Box,
): Mp4TimeHeader {
  const invalid = { timescale: 0, duration: 0, valid: false };
  const version = bytes[box.start];
  if (version === 0) {
    if (box.start + 20 > box.end) return invalid;
    return {
      timescale: view.getUint32(box.start + 12),
      duration: view.getUint32(box.start + 16),
      valid: true,
    };
  }
  if (version === 1) {
    if (box.start + 32 > box.end) return invalid;
    const large = view.getBigUint64(box.start + 24);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return invalid;
    return {
      timescale: view.getUint32(box.start + 20),
      duration: Number(large),
      valid: true,
    };
  }
  return invalid;
}

/**
 * Probe de un contenedor MP4 (M4A).
 *
 * Paridad con `mutagen.mp4.MP4Info.load`:
 *   - `ftyp` puede no ser la primera caja (mutagen camina los átomos desde 0 y
 *     `MP4.score` solo mira los primeros 128 bytes); basura al inicio no
 *     parsea y se rechaza.
 *   - hace falta un track `soun`; sin él mutagen caería al `mvhd` y aceptaría
 *     un MP4 sin pista de audio, así que se rechaza.
 *   - la duración es la del `mdhd` del PRIMER track `soun` (no la del `mvhd`).
 *   - `duration = 0` es válido: mutagen deja `length = 0` y el service guarda
 *     `duration = None`, por eso `recognized` sigue en `true`.
 */
function probeMp4(bytes: Uint8Array): AudioProbe {
  if (bytes.length < 8) return notRecognized();

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Walk top-level desde 0 (igual que `Atoms`): `ftyp` se exige en cualquier
  // posición y `moov` es el primero que aparezca. Una caja ilegible corta el
  // walk (basura al inicio = no hay `ftyp` → rechazo). DESVIACIÓN deliberada:
  // basura en la cola se tolera MÁS que mutagen (que aborta el archivo si un
  // átomo final parsea mal o si un contenedor se rompe después del `moov`);
  // acá conservamos lo leído — solo afecta archivos ya corruptos.
  // Matiz del score: mutagen detecta `ftyp` dentro de los primeros 128 bytes;
  // un `ftyp` más allá de esa ventana lo rechaza Python y acá no (irrelevante
  // para un M4A real).
  let sawFtyp = false;
  let moov: Mp4Box | null = null;
  let offset = 0;
  for (let boxes = 0; offset < bytes.length && boxes < MAX_BOXES; boxes += 1) {
    const box = readMp4Box(bytes, view, offset, bytes.length);
    if (!box) break;
    if (box.type === "ftyp") sawFtyp = true;
    else if (box.type === "moov" && moov === null) moov = box;
    offset = box.end;
  }
  if (!sawFtyp || moov === null) return notRecognized();

  // Primer track de audio: mutagen corta en el primero con `hdlr` = `soun`.
  let audioTrak: Mp4Box | null = null;
  for (const trak of findMp4Boxes(bytes, view, moov.start, moov.end, "trak")) {
    if (isMp4AudioTrak(bytes, view, trak)) {
      audioTrak = trak;
      break;
    }
  }
  if (audioTrak === null) return notRecognized();

  const mdia = findMp4Box(bytes, view, audioTrak.start, audioTrak.end, "mdia");
  const mdhd =
    mdia === null
      ? null
      : findMp4Box(bytes, view, mdia.start, mdia.end, "mdhd");
  // Sin `mdhd` legible mutagen aborta el archivo (no es audio): se rechaza.
  if (mdhd === null) return notRecognized();
  const header = readMp4TimeHeader(bytes, view, mdhd);
  if (!header.valid) return notRecognized();

  // mutagen: `length = duration / timescale` (timescale 0 → length 0).
  const seconds =
    header.timescale > 0 ? header.duration / header.timescale : 0;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { durationSeconds: null, recognized: true };
  }
  return {
    durationSeconds: Math.max(1, pythonRound(seconds)),
    recognized: true,
  };
}

/**
 * `probeAudio(bytes)` -> duración + si es audio parseable.
 * Prueba MP3, después ADTS AAC y por último el contenedor MP4 (M4A).
 */
export function probeAudio(bytes: Uint8Array): AudioProbe {
  const mp3 = probeMp3(bytes);
  if (mp3.recognized) return mp3;
  const adts = probeAdts(bytes);
  if (adts.recognized) return adts;
  return probeMp4(bytes);
}
