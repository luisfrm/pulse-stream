/**
 * Fixtures MP4 para los tests del probe de audio.
 *
 * Los usan `src/lib/audio.test.ts` (unitarios) y `tests/zip-helpers.ts`
 * (import por ZIP). Deben quedar 1:1 con los builders de
 * `apps/api/tests/test_audio_probe.py`: mismos átomos y offsets (`hdlr` con el
 * handler en los bytes 8..12 del payload; `mvhd`/`mdhd` v0 con timescale en
 * +12 y duration en +16) y misma duración. No hay módulo compartido entre
 * Python y TS: si cambia un builder acá, cambiarlo también allá.
 */

const encoder = new TextEncoder();

export function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Caja MP4 (`size` de 32 bits + tipo de 4 caracteres + payload). */
export function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(encoder.encode(type), 4);
  out.set(payload, 8);
  return out;
}

/** `ftyp` de un M4A (`M4A ` / `mp42`). */
export function ftypBox(): Uint8Array {
  return mp4Box(
    "ftyp",
    concat(
      encoder.encode("M4A "),
      new Uint8Array(4), // minor version
      encoder.encode("M4A "),
      encoder.encode("mp42"),
    ),
  );
}

/** Caja `free` de `size` bytes en total (mínimo 8): relleno válido del MP4. */
export function freeBox(size = 8): Uint8Array {
  return mp4Box("free", new Uint8Array(Math.max(0, size - 8)));
}

/** `hdlr` de un track: handler type en los bytes 8..12 del payload. */
export function hdlrBox(handler: "soun" | "vide"): Uint8Array {
  // version+flags (4) + pre_defined (4) + handler type (4) + reservado.
  const payload = new Uint8Array(24);
  payload.set(encoder.encode(handler), 8);
  return mp4Box("hdlr", payload);
}

/**
 * Full atom v0 de tiempos (`mvhd`/`mdhd`): version+flags (4), creation (4),
 * modification (4), timescale (4), duration (4) y el resto en ceros.
 *
 * Con timescale 1000 la duración es `seconds * 1000`; `seconds = 2.5` da
 * duration 2500, el caso `.5` donde Python (`round`) y JS (`Math.round`)
 * redondean distinto.
 */
function timeHeaderBox(
  type: "mvhd" | "mdhd",
  seconds: number,
  timescale: number,
): Uint8Array {
  const payload = new Uint8Array(24);
  const view = new DataView(payload.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, seconds * timescale);
  return mp4Box(type, payload);
}

/** `mvhd` v0: duración total del contenedor (NO la usa el probe). */
export function mvhdBox(seconds: number, timescale = 1000): Uint8Array {
  return timeHeaderBox("mvhd", seconds, timescale);
}

/** `mdhd` v0 del track: es la duración que lee el probe (y mutagen). */
export function mdhdBox(seconds: number, timescale = 1000): Uint8Array {
  return timeHeaderBox("mdhd", seconds, timescale);
}

/** `trak/mdia` con el `hdlr` pedido y el `mdhd` (se omite si es `null`). */
export function trakBox(
  handler: "soun" | "vide",
  mdhd: Uint8Array | null,
): Uint8Array {
  return mp4Box(
    "trak",
    mp4Box("mdia", concat(hdlrBox(handler), mdhd ?? new Uint8Array(0))),
  );
}

/** `moov` con los hijos dados (normalmente `mvhd` + `trak`). */
export function moovBox(...children: Uint8Array[]): Uint8Array {
  return mp4Box("moov", concat(...children));
}

/**
 * M4A mínimo: `ftyp` + `moov(mvhd + trak soun)`.
 *
 * `mvhd` y `mdhd` llevan la MISMA duración (aunque el probe solo lea el
 * `mdhd`). Con `handler = "vide"` es un MP4 sin pista de audio. Los casos
 * borde (sin `mvhd`, `mdhd` en 0, sin `ftyp`, `free` adelante) se arman en los
 * tests con los builders.
 */
export function m4aBytes(
  seconds = 2,
  handler: "soun" | "vide" = "soun",
): Uint8Array {
  return concat(
    ftypBox(),
    moovBox(mvhdBox(seconds), trakBox(handler, mdhdBox(seconds))),
  );
}
