/**
 * Lector de ZIP por directorio central (reemplaza a `zipfile` de Python).
 *
 * `fflate` sirve para inflar, pero su API síncrona devuelve un objeto indexado
 * por nombre: **colapsa entradas con el mismo nombre** y no expone el flag de
 * encriptación. El import necesita lo que da `zipfile.infolist()`: lista
 * ORDENADA (con duplicados), tamaños ANTES de descomprimir (protección contra
 * ZIP bomb), nombre decodificado según el flag UTF-8 y CRC por entrada. Por eso
 * caminamos el directorio central (lo mismo que lee CPython) y usamos
 * `inflateSync` solo para el contenido, cuando el service lo pide.
 *
 * Errores:
 *   - `invalid`: el archivo no se puede abrir como ZIP (estructura rota, EOCD
 *     fuera de rango, directorio central inconsistente). Python: `BadZipFile`.
 *   - `entry`: una entrada puntual no se puede leer (encriptada, compresión no
 *     soportada, tamaño/CRC que no coinciden). Python: error de `read()`.
 *
 * Los bytes descomprimidos NUNCA se cachean acá: `read()` devuelve un array
 * nuevo que el caller descarta al terminar con el archivo.
 */

import { inflateSync } from "fflate";

import { crc32 } from "@/lib/crc32";

export class ZipError extends Error {
  constructor(
    readonly kind: "invalid" | "entry",
    message: string,
  ) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  /** Nombre decodificado (UTF-8 si el flag lo indica; si no, cp437). */
  name: string;
  /** `true` si la entrada es un directorio (`name` termina en "/"). */
  directory: boolean;
  /** `true` si requiere contraseña (bit 0 del general purpose flag). */
  encrypted: boolean;
  /** 0 = store, 8 = deflate. */
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  /**
   * Bytes descomprimidos y verificados (CRC + tamaño declarado).
   * Lanza `ZipError("entry")` si la entrada no se puede leer.
   */
  read(): Uint8Array;
}

export interface ZipArchive {
  entries: ZipEntry[];
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;

/** Tamaño máximo del "comentario final" del EOCD (+ ZIP64 locator). */
const MAX_EOCD_SEARCH = 65_557 + 20;

/** Bit 11 del general purpose flag: nombre en UTF-8. */
const UTF8_NAME_FLAG = 0x0800;

/** Bit 0 del general purpose flag: entrada encriptada. */
const ENCRYPTED_FLAG = 0x0001;

/**
 * Tabla cp437 para 0x80..0xFF (la codificación por defecto de los ZIP sin el
 * flag UTF-8, igual que `zipfile`). Se incluye acá en vez de usar
 * `TextDecoder("ibm437")` porque el runtime de Workers no garantiza las
 * codificaciones legacy.
 */
const CP437_HIGH = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7, 0x00ea,
  0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5, 0x00c9, 0x00e6,
  0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9, 0x00ff, 0x00d6, 0x00dc,
  0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192, 0x00e1, 0x00ed, 0x00f3, 0x00fa,
  0x00f1, 0x00d1, 0x00aa, 0x00ba, 0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc,
  0x00a1, 0x00ab, 0x00bb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561,
  0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b,
  0x2510, 0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567, 0x2568,
  0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b, 0x256a, 0x2518,
  0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580, 0x03b1, 0x00df, 0x0393,
  0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4, 0x03a6, 0x0398, 0x03a9, 0x03b4,
  0x221e, 0x03c6, 0x03b5, 0x2229, 0x2261, 0x00b1, 0x2265, 0x2264, 0x2320,
  0x2321, 0x00f7, 0x2248, 0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2,
  0x25a0, 0x00a0,
] as const;

const utf8 = new TextDecoder("utf-8");

/** Nombre de la entrada según el flag UTF-8 (bit 11) del ZIP. */
function decodeName(bytes: Uint8Array, utf8Flag: boolean): string {
  if (utf8Flag) return utf8.decode(bytes);

  let name = "";
  for (const byte of bytes) {
    name +=
      byte < 0x80
        ? String.fromCharCode(byte)
        : String.fromCodePoint(CP437_HIGH[byte - 0x80] ?? 0xfffd);
  }
  return name;
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

/** `u64` como número: los ZIP de la app no superan 2^53 bytes. */
function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) + u32(bytes, offset + 4) * 0x1_0000_0000;
}

function requireRange(bytes: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new ZipError("invalid", "ZIP truncado");
  }
}

/**
 * Offset del End Of Central Directory, o `-1`.
 *
 * Además de la firma se valida que el comentario declarado (`u16` en +20)
 * termine dentro del buffer: un EOCD "encontrado" dentro de bytes arbitrarios
 * no debe hacer creer que el archivo es un ZIP.
 */
function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - MAX_EOCD_SEARCH);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (u32(bytes, offset) !== EOCD_SIGNATURE) continue;
    const commentLength = u16(bytes, offset + 20);
    if (offset + 22 + commentLength > bytes.length) continue;
    return offset;
  }
  return -1;
}

interface CentralDirectoryInfo {
  entries: number;
  offset: number;
  size: number;
}

function readCentralDirectoryInfo(
  bytes: Uint8Array,
  eocdOffset: number,
): CentralDirectoryInfo {
  let entries = u16(bytes, eocdOffset + 8);
  let size = u32(bytes, eocdOffset + 12);
  let offset = u32(bytes, eocdOffset + 16);

  const needsZip64 =
    entries === 0xffff || size === 0xffffffff || offset === 0xffffffff;
  if (!needsZip64) return { entries, offset, size };

  const locatorOffset = eocdOffset - 20;
  if (
    locatorOffset < 0 ||
    u32(bytes, locatorOffset) !== ZIP64_LOCATOR_SIGNATURE
  ) {
    throw new ZipError("invalid", "ZIP64 sin localizador");
  }
  const zip64EocdOffset = u64(bytes, locatorOffset + 8);
  requireRange(bytes, zip64EocdOffset, 56);
  if (u32(bytes, zip64EocdOffset) !== ZIP64_EOCD_SIGNATURE) {
    throw new ZipError("invalid", "ZIP64 sin EOCD");
  }

  entries = u64(bytes, zip64EocdOffset + 32);
  size = u64(bytes, zip64EocdOffset + 40);
  offset = u64(bytes, zip64EocdOffset + 48);
  return { entries, offset, size };
}

/**
 * Tamaño real de una entrada: si el campo de 32 bits es `0xffffffff`, el valor
 * viaja en el extra field 0x0001 (Zip64), en orden uncompressed/compressed.
 *
 * Cada extra field se acota a su propio `length` antes de leer: un extra
 * corrupto no puede leer fuera del bloque (ni del buffer).
 */
function readEntrySize(
  bytes: Uint8Array,
  extraStart: number,
  extraLength: number,
  field32: number,
  isCompressed: boolean,
): number {
  if (field32 !== 0xffffffff) return field32;

  let offset = extraStart;
  const end = extraStart + extraLength;
  while (offset + 4 <= end) {
    const id = u16(bytes, offset);
    const length = u16(bytes, offset + 2);
    const fieldStart = offset + 4;
    if (fieldStart + length > end) break;

    if (id === ZIP64_EXTRA_ID && length >= 16) {
      return isCompressed
        ? u64(bytes, fieldStart + 8)
        : u64(bytes, fieldStart);
    }
    offset = fieldStart + length;
  }
  throw new ZipError("invalid", "Zip64 sin tamaños");
}

interface ReaderOptions {
  localOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  crc: number;
  encrypted: boolean;
}

function makeReader(bytes: Uint8Array, options: ReaderOptions): () => Uint8Array {
  return () => {
    if (options.encrypted) {
      // Python: `read()` de una entrada cifrada lanza RuntimeError (sin
      // contraseña no hay nada que descomprimir).
      throw new ZipError("entry", "Entrada encriptada");
    }

    requireRange(bytes, options.localOffset, 30);
    if (u32(bytes, options.localOffset) !== LOCAL_HEADER_SIGNATURE) {
      throw new ZipError("entry", "Local header inválido");
    }

    const nameLength = u16(bytes, options.localOffset + 26);
    const extraLength = u16(bytes, options.localOffset + 28);
    const dataOffset =
      options.localOffset + 30 + nameLength + extraLength;
    requireRange(bytes, dataOffset, options.compressedSize);

    const data = inflateEntry(bytes, dataOffset, options);

    // El CRC del directorio central es la verificación final: cubre streams
    // corruptos cuyo tamaño sí coincide.
    if (crc32(data) !== options.crc) {
      throw new ZipError("entry", "CRC inválido");
    }
    return data;
  };
}

/**
 * Descomprime UNA entrada y verifica el tamaño declarado.
 *
 * `inflateSync` recibe un `out` del tamaño declarado: si el stream real es más
 * grande (ZIP bomb con tamaño mentido) fflate falla sin reservar memoria de más
 * y la entrada se reporta como ilegible.
 */
function inflateEntry(
  bytes: Uint8Array,
  dataOffset: number,
  options: ReaderOptions,
): Uint8Array {
  const compressed = bytes.subarray(
    dataOffset,
    dataOffset + options.compressedSize,
  );

  if (options.compressionMethod === 0) {
    if (compressed.length !== options.uncompressedSize) {
      throw new ZipError("entry", "Tamaño descomprimido inválido");
    }
    return compressed.slice();
  }

  if (options.compressionMethod !== 8) {
    throw new ZipError("entry", "Compresión no soportada");
  }

  let inflated: Uint8Array;
  try {
    inflated = inflateSync(compressed, {
      out: new Uint8Array(options.uncompressedSize),
    });
  } catch {
    throw new ZipError("entry", "No se pudo descomprimir la entrada");
  }

  // Defensa extra ante un `out` más chico que el stream real (fflate puede
  // devolver un array mayor que el `out` pedido): nunca se acepta más de lo
  // declarado.
  if (inflated.length > options.uncompressedSize) {
    throw new ZipError("entry", "Tamaño descomprimido inválido");
  }
  return inflated;
}

/**
 * Lee el directorio central de un ZIP.
 * Cualquier problema estructural lanza `ZipError("invalid")`.
 */
export function readZip(bytes: Uint8Array): ZipArchive {
  const eocdOffset = findEocd(bytes);
  if (eocdOffset < 0) throw new ZipError("invalid", "Sin EOCD");

  const info = readCentralDirectoryInfo(bytes, eocdOffset);

  if (info.entries === 0) {
    // Un EOCD sin entradas con directorio central no vacío es un archivo
    // inconsistente: Python lo rechaza al leer el índice.
    if (info.size > 0) {
      throw new ZipError("invalid", "Directorio central inconsistente");
    }
    return { entries: [] };
  }

  requireRange(bytes, info.offset, info.size);
  requireRange(bytes, info.offset, 46);

  const entries: ZipEntry[] = [];
  let offset = info.offset;

  for (let index = 0; index < info.entries; index += 1) {
    requireRange(bytes, offset, 46);
    if (u32(bytes, offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new ZipError("invalid", "Directorio central corrupto");
    }

    const flags = u16(bytes, offset + 8);
    const compressionMethod = u16(bytes, offset + 10);
    const crc = u32(bytes, offset + 16);
    const rawCompressedSize = u32(bytes, offset + 20);
    const rawUncompressedSize = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);

    requireRange(bytes, offset + 46, nameLength + extraLength);
    const name = decodeName(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
      (flags & UTF8_NAME_FLAG) !== 0,
    );
    const extraStart = offset + 46 + nameLength;

    const compressedSize = readEntrySize(
      bytes,
      extraStart,
      extraLength,
      rawCompressedSize,
      true,
    );
    const uncompressedSize = readEntrySize(
      bytes,
      extraStart,
      extraLength,
      rawUncompressedSize,
      false,
    );

    entries.push({
      name,
      directory: name.endsWith("/"),
      encrypted: (flags & ENCRYPTED_FLAG) !== 0,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      read: makeReader(bytes, {
        localOffset,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        crc,
        encrypted: (flags & ENCRYPTED_FLAG) !== 0,
      }),
    });

    offset = extraStart + extraLength + commentLength;
  }

  return { entries };
}
