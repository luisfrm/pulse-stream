/**
 * CRC-32 (polinomio 0xEDB88320, el mismo de ZIP/PNG).
 *
 * El import por ZIP valida el CRC de cada entrada contra el que declara el
 * directorio central: es la única forma de detectar un stream corrupto cuando
 * el tamaño descomprimido coincide. `fflate` no lo expone en su API pública.
 */

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;

  const built = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    built[index] = value >>> 0;
  }
  table = built;
  return built;
}

/** CRC-32 de `bytes` como entero sin signo. */
export function crc32(bytes: Uint8Array): number {
  const lookup = crcTable();
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^ lookup[(crc ^ byte) & 0xff]!;
  }

  return (crc ^ 0xffffffff) >>> 0;
}
