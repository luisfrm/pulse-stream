/**
 * Tests del parser de audio (reemplaza a `mutagen`).
 *
 * Los fixtures de MP4 viven en `src/lib/__fixtures__/mp4.ts` (mismos bytes que
 * `apps/api/tests/test_audio_probe.py`). Los de MP3/ADTS son los de
 * `test_album_zip_import.py`: `0xFF 0xFB 0x90 0x00` + 413 ceros = un frame
 * MPEG1 Layer III de 417 bytes (128 kbps, 44100 Hz, 1152 samples ≈ 0.026 s).
 * Dos frames → 1 segundo redondeado (`max(1, round(...))`).
 */

import { describe, expect, it } from "vitest";

import { probeAudio } from "@/lib/audio";
import {
  concat,
  freeBox,
  ftypBox,
  m4aBytes,
  mdhdBox,
  moovBox,
  mvhdBox,
  trakBox,
} from "@/lib/__fixtures__/mp4";

/** Un frame MPEG1 Layer III (417 bytes) como el de `test_album_zip_import.py`. */
function mp3Frame(): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return frame;
}

/** Tag ID3v2 vacío de 16 bytes (header de 10 + payload syncsafe). */
function id3v2Header(payloadBytes = 16): Uint8Array {
  return new Uint8Array([
    0x49,
    0x44,
    0x33, // "ID3"
    0x03,
    0x00, // versión 2.3
    0x00, // flags
    0x00,
    0x00,
    0x00,
    payloadBytes, // tamaño syncsafe
    ...new Uint8Array(payloadBytes),
  ]);
}

/** Frame ADTS AAC mínimo (1024 samples, 44100 Hz). */
function adtsFrame(): Uint8Array {
  const length = 8;
  return new Uint8Array([
    0xff,
    0xf1, // sync 0xFFF + MPEG-4, sin CRC
    // profile 1, sample rate index 4 (44100), channel config
    (1 << 6) | (4 << 2) | 0,
    (2 << 6) | ((length >> 11) & 0x03),
    (length >> 3) & 0xff,
    ((length & 0x07) << 5) | 0x1f,
    0xfc,
    0x00,
  ]);
}

describe("probeAudio", () => {
  it("MP3 de dos frames: reconocido y 1 segundo", () => {
    const probe = probeAudio(concat(mp3Frame(), mp3Frame()));
    expect(probe.recognized).toBe(true);
    expect(probe.durationSeconds).toBe(1);
  });

  it("MP3 con tag ID3v2: saltea el tag y mide los frames", () => {
    const probe = probeAudio(concat(id3v2Header(), mp3Frame(), mp3Frame()));
    expect(probe.recognized).toBe(true);
    expect(probe.durationSeconds).toBe(1);
  });

  it("ADTS AAC: reconocido y 1 segundo (dos frames de ~23 ms)", () => {
    const probe = probeAudio(concat(adtsFrame(), adtsFrame()));
    expect(probe.recognized).toBe(true);
    expect(probe.durationSeconds).toBe(1);
  });

  it("M4A con track soun: reconocido y 3 segundos (mdhd)", () => {
    const probe = probeAudio(m4aBytes(3));
    expect(probe.recognized).toBe(true);
    expect(probe.durationSeconds).toBe(3);
  });

  it("MP4 con solo track vide (sin pista de audio): no reconocido", () => {
    // Tiene `ftyp` + `mvhd` (y un `mdhd`), pero ningún track `soun`.
    expect(probeAudio(m4aBytes(3, "vide")).recognized).toBe(false);
  });

  it("MP4 sin ninguna pista: no reconocido", () => {
    const withoutTrak = concat(ftypBox(), moovBox(mvhdBox(3)));
    expect(probeAudio(withoutTrak).recognized).toBe(false);
  });

  it("M4A sin mvhd pero con soun + mdhd: reconocido (paridad con mutagen)", () => {
    // mutagen solo consulta el `mvhd` cuando NO hay track de audio.
    const noMvhd = concat(ftypBox(), moovBox(trakBox("soun", mdhdBox(2))));
    const probe = probeAudio(noMvhd);
    expect(probe.recognized).toBe(true);
    expect(probe.durationSeconds).toBe(2);
  });

  it("mdhd con duration 0: reconocido y duración null (no usa el mvhd)", () => {
    // El `mvhd` dice 3 s, el `mdhd` del track dice 0: manda el `mdhd`.
    const zeroDuration = concat(
      ftypBox(),
      moovBox(mvhdBox(3), trakBox("soun", mdhdBox(0))),
    );
    expect(probeAudio(zeroDuration)).toEqual({
      durationSeconds: null,
      recognized: true,
    });
  });

  it("sin ninguna caja ftyp en el top level: no reconocido", () => {
    // Aísla la regla: el resto del MP4 es válido (soun + mdhd).
    const noFtyp = concat(
      freeBox(8),
      moovBox(mvhdBox(2), trakBox("soun", mdhdBox(2))),
    );
    expect(probeAudio(noFtyp).recognized).toBe(false);
  });

  it("free antes del ftyp: reconocido (paridad con mutagen)", () => {
    // mutagen camina desde 0 y `MP4.score` mira los primeros 128 bytes: un
    // `free` adelante no invalida el archivo.
    const freeBeforeFtyp = concat(
      freeBox(8),
      ftypBox(),
      moovBox(mvhdBox(2), trakBox("soun", mdhdBox(2))),
    );
    const probe = probeAudio(freeBeforeFtyp);
    expect(probe.recognized).toBe(true);
    expect(probe.durationSeconds).toBe(2);
  });

  it("duración .5: redondeo half-to-even como Python (2.5 → 2, 3.5 → 4)", () => {
    const below = probeAudio(
      concat(ftypBox(), moovBox(mvhdBox(9), trakBox("soun", mdhdBox(2.5)))),
    );
    expect(below.recognized).toBe(true);
    expect(below.durationSeconds).toBe(2);

    const above = probeAudio(
      concat(ftypBox(), moovBox(mvhdBox(1), trakBox("soun", mdhdBox(3.5)))),
    );
    expect(above.recognized).toBe(true);
    expect(above.durationSeconds).toBe(4);
  });

  it("bytes arbitrarios: no reconocido", () => {
    const garbage = new TextEncoder().encode("this is not audio");
    expect(probeAudio(garbage)).toEqual({
      durationSeconds: null,
      recognized: false,
    });
  });

  it("un header suelto de MP3 no alcanza (se exigen 2 frames)", () => {
    expect(probeAudio(mp3Frame()).recognized).toBe(false);
  });

  it("vacío: no reconocido", () => {
    expect(probeAudio(new Uint8Array(0)).recognized).toBe(false);
  });
});
