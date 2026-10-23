/**
 * Tests del parser de audio (reemplaza a `mutagen`).
 *
 * Los fixtures son los mismos bytes que usan los tests de Python:
 * `0xFF 0xFB 0x90 0x00` + 413 ceros = un frame MPEG1 Layer III de 417 bytes
 * (128 kbps, 44100 Hz, 1152 samples ≈ 0.026 s). Dos frames → 1 segundo
 * redondeado (`max(1, round(...))`).
 */

import { describe, expect, it } from "vitest";

import { probeAudio } from "@/lib/audio";

/** Un frame MPEG1 Layer III (417 bytes) como el de `test_album_zip_import.py`. */
function mp3Frame(): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return frame;
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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
