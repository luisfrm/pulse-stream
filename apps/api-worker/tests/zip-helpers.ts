/**
 * Fixtures compartidos de ZIP/audio para los tests de F5.
 *
 * No hay R2 ni audio real: los "MP3" son los mismos bytes mínimos que usa el
 * backend Python (`0xFF 0xFB 0x90 0x00` + 413 ceros, dos frames ≈ 0.05 s → 1 s)
 * y los ZIP se arman con `fflate` o con un builder propio cuando hacen falta
 * nombres repetidos, flags del ZIP, tamaños mentidos o CRC inválidos (cosas que
 * `zipSync` no puede expresar).
 */

import { deflateSync, zipSync } from "fflate";

import { crc32 } from "@/lib/crc32";

const encoder = new TextEncoder();

/** Un frame MPEG1 Layer III de 417 bytes (128 kbps / 44100 Hz). */
export function mp3Frame(): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return frame;
}

/** MP3 mínimo de dos frames (~0.05 s, se redondea a 1 s). */
export function mp3Bytes(): Uint8Array {
  return concat(mp3Frame(), mp3Frame());
}

/** MP3 con un tag ID3v2 al frente: el import debe ignorar los tags. */
export function mp3WithId3(tagPayloadBytes = 16): Uint8Array {
  const tag = new Uint8Array(10 + tagPayloadBytes);
  tag.set([
    0x49,
    0x44,
    0x33, // "ID3"
    0x03,
    0x00, // versión 2.3
    0x00, // flags
    0x00,
    0x00,
    0x00,
    tagPayloadBytes, // tamaño syncsafe
  ]);
  return concat(tag, mp3Frame(), mp3Frame());
}

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

/** Deflate de `data` (para entradas con método 8 armadas a mano). */
export function deflate(data: Uint8Array): Uint8Array {
  return deflateSync(data);
}

/** ZIP con deflate a partir de un mapa nombre → contenido. */
export function zipWith(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

/** ZIP con nombres REPETIDOS (store) — `zipSync` indexa por nombre. */
export function buildZip(entries: Array<[string, Uint8Array]>): Uint8Array {
  return buildZipEntries(
    entries.map(([name, data]) => ({ name, payload: data })),
  );
}

/** Entrada del builder: permite mentir tamaños, CRC y flags. */
export interface ZipFixtureEntry {
  /** Nombre en UTF-8 (salvo que se pase `nameBytes`). */
  name: string;
  /** Bytes que se escriben como contenido (comprimidos si `method = 8`). */
  payload: Uint8Array;
  /** Bytes originales para el CRC (default: `payload`). */
  original?: Uint8Array;
  method?: 0 | 8;
  /** Tamaño declarado en el directorio central (default: `payload.length`). */
  declaredUncompressedSize?: number;
  declaredCompressedSize?: number;
  /** CRC declarado (default: crc32 de `original`). */
  crc?: number;
  /** `false` = sin flag UTF-8 (el lector debe decodificar cp437). */
  utf8Name?: boolean;
  /** Bytes crudos del nombre (para cp437); pisa `name`. */
  nameBytes?: Uint8Array;
  /** Flag de encriptación (bit 0). */
  encrypted?: boolean;
}

/**
 * Builder de ZIP con control total del directorio central.
 *
 * `zipSync` indexa por nombre (no puede emitir duplicados) y siempre calcula
 * tamaños/CRC reales, así que los casos de ZIP bomb, CRC roto, entradas
 * cifradas y cp437 necesitan este builder.
 */
export function buildZipEntries(entries: ZipFixtureEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = entry.nameBytes ?? encoder.encode(entry.name);
    const method = entry.method ?? 0;
    const payload = entry.payload;
    const compressedSize = entry.declaredCompressedSize ?? payload.length;
    const uncompressedSize = entry.declaredUncompressedSize ?? payload.length;
    const crc = entry.crc ?? crc32(entry.original ?? payload);

    let flags = entry.utf8Name === false ? 0 : 0x0800;
    if (entry.encrypted) flags |= 0x0001;

    const local = new Uint8Array(30 + nameBytes.length + payload.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // versión
    localView.setUint16(6, flags, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, 0, true); // hora
    localView.setUint16(12, 0x21, true); // fecha
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressedSize, true);
    localView.setUint32(22, uncompressedSize, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(payload, 30 + nameBytes.length);
    chunks.push(local);

    const header = new Uint8Array(46 + nameBytes.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint16(4, 20, true);
    headerView.setUint16(6, 20, true);
    headerView.setUint16(8, flags, true);
    headerView.setUint16(10, method, true);
    headerView.setUint32(16, crc, true);
    headerView.setUint32(20, compressedSize, true);
    headerView.setUint32(24, uncompressedSize, true);
    headerView.setUint16(28, nameBytes.length, true);
    headerView.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);

    offset += local.length;
  }

  const centralStart = offset;
  const centralSize = central.reduce((size, chunk) => size + chunk.length, 0);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);

  return concat(...chunks, ...central, eocd);
}

/** `multipart/form-data` con el campo `file` (lo que manda el panel admin). */
export function zipFormData(bytes: Uint8Array, filename = "album.zip"): FormData {
  const form = new FormData();
  // Copia a un ArrayBuffer propio: el `File` no comparte el buffer del caller.
  const buffer = bytes.slice().buffer as ArrayBuffer;
  form.set("file", new File([buffer], filename, { type: "application/zip" }));
  return form;
}
