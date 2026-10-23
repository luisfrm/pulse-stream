/**
 * Tests del lector de ZIP propio (directorio central + inflate de fflate).
 *
 * Es el reemplazo de `zipfile.infolist()`: lista ORDENADA (con nombres
 * repetidos), tamaños antes de descomprimir, nombres según el flag UTF-8 y
 * validación de CRC/tamaño al leer cada entrada.
 */

import { describe, expect, it } from "vitest";

import { readZip, ZipError } from "@/lib/zip";
import {
  buildZip,
  buildZipEntries,
  deflate,
  zipWith,
} from "./zip-helpers";

const encoder = new TextEncoder();

describe("readZip", () => {
  it("lista las entradas en orden con nombres, tamaños y contenido", () => {
    const archive = readZip(
      zipWith({
        "01 - Uno.mp3": encoder.encode("uno"),
        "carpeta/02 - Dos.aac": encoder.encode("dos dos"),
        "portada.jpg": encoder.encode("img"),
      }),
    );

    const entries = archive.entries;
    expect(entries.map((entry) => entry.name)).toEqual([
      "01 - Uno.mp3",
      "carpeta/02 - Dos.aac",
      "portada.jpg",
    ]);
    expect(entries.every((entry) => !entry.directory)).toBe(true);
    expect(entries.every((entry) => !entry.encrypted)).toBe(true);
    expect(entries[0]?.uncompressedSize).toBe(3);
    expect(new TextDecoder().decode(entries[1]?.read())).toBe("dos dos");
  });

  it("soporta entradas sin comprimir (store) y con deflate", () => {
    const stored = readZip(
      buildZip([["a.mp3", encoder.encode("sin comprimir")]]),
    );
    expect(stored.entries[0]?.compressionMethod).toBe(0);
    expect(new TextDecoder().decode(stored.entries[0]?.read())).toBe(
      "sin comprimir",
    );

    const payload = encoder.encode("con deflate, contenido repetido repetido");
    const deflated = readZip(
      buildZipEntries([
        {
          name: "b.mp3",
          payload: deflate(payload),
          method: 8,
          original: payload,
          declaredUncompressedSize: payload.length,
        },
      ]),
    );
    expect(deflated.entries[0]?.compressionMethod).toBe(8);
    expect(new TextDecoder().decode(deflated.entries[0]?.read())).toBe(
      "con deflate, contenido repetido repetido",
    );
  });

  it("preserva nombres repetidos (zipfile.infolist, no un objeto por nombre)", () => {
    const archive = readZip(
      buildZip([
        ["Duplicado.mp3", encoder.encode("primero")],
        ["Duplicado.mp3", encoder.encode("segundo")],
      ]),
    );

    expect(archive.entries).toHaveLength(2);
    expect(new TextDecoder().decode(archive.entries[0]?.read())).toBe("primero");
    expect(new TextDecoder().decode(archive.entries[1]?.read())).toBe("segundo");
  });

  it("marca los directorios", () => {
    const archive = readZip(buildZip([["folder/", new Uint8Array(0)]]));
    expect(archive.entries[0]?.directory).toBe(true);
    expect(archive.entries[0]?.name).toBe("folder/");
  });

  it("ZIP vacío: sin entradas", () => {
    const empty = new Uint8Array(22);
    empty.set([0x50, 0x4b, 0x05, 0x06]);
    expect(readZip(empty).entries).toEqual([]);
  });

  it("bytes que no son ZIP -> ZipError(invalid)", () => {
    expect(() => readZip(encoder.encode("this is not a zip"))).toThrowError(
      ZipError,
    );
    try {
      readZip(encoder.encode("this is not a zip"));
    } catch (error) {
      expect((error as ZipError).kind).toBe("invalid");
    }
  });

  it("ZIP truncado -> ZipError(invalid)", () => {
    const truncated = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00,
    ]);
    expect(() => readZip(truncated)).toThrowError(ZipError);
  });

  it("EOCD con comentario fuera del buffer no se acepta", () => {
    // ZIP vacío cuyo EOCD declara 65535 bytes de comentario que no existen: si
    // no se validara el comentario, se tomaría como un ZIP válido.
    const bytes = zipWith({});
    bytes[20] = 0xff;
    bytes[21] = 0xff;

    expect(() => readZip(bytes)).toThrowError(ZipError);
  });

  it("EOCD con 0 entradas y directorio central no vacío -> inválido", () => {
    const bytes = buildZip([["a.mp3", encoder.encode("x")]]);
    // Pone en 0 el conteo del EOCD dejando el directorio central intacto.
    const eocdOffset = bytes.length - 22;
    bytes[eocdOffset + 8] = 0;
    bytes[eocdOffset + 9] = 0;

    expect(() => readZip(bytes)).toThrowError(ZipError);
  });

  it("entrada encriptada: se marca y `read()` falla", () => {
    const archive = readZip(
      buildZipEntries([
        { name: "a.mp3", payload: encoder.encode("x"), encrypted: true },
      ]),
    );

    expect(archive.entries[0]?.encrypted).toBe(true);
    expect(() => archive.entries[0]?.read()).toThrowError(ZipError);
  });

  it("CRC que no coincide con el directorio central -> entrada ilegible", () => {
    const payload = encoder.encode("contenido");
    const archive = readZip(
      buildZipEntries([{ name: "a.mp3", payload, crc: 0xdeadbeef }]),
    );

    expect(() => archive.entries[0]?.read()).toThrowError(ZipError);
  });

  it("tamaño declarado menor al real (ZIP bomb): no se acepta el contenido", () => {
    // Declara 64 bytes pero infla a 1 MB: el `out` acotado impide reservar de más.
    const original = new Uint8Array(1024 * 1024);
    const archive = readZip(
      buildZipEntries([
        {
          name: "bomba.mp3",
          payload: deflate(original),
          method: 8,
          original,
          declaredUncompressedSize: 64,
          declaredCompressedSize: deflate(original).length,
        },
      ]),
    );

    expect(archive.entries[0]?.uncompressedSize).toBe(64);
    expect(() => archive.entries[0]?.read()).toThrowError(ZipError);
  });

  it("nombre cp437 (sin flag UTF-8) se decodifica con acentos", () => {
    // "Café Tacvba.mp3" en cp437: "é" = 0x82.
    const nameBytes = new Uint8Array([
      0x43, 0x61, 0x66, 0x82, 0x20, 0x54, 0x61, 0x63, 0x76, 0x62, 0x61, 0x2e,
      0x6d, 0x70, 0x33,
    ]);
    const archive = readZip(
      buildZipEntries([
        {
          name: "ignorado",
          nameBytes,
          utf8Name: false,
          payload: encoder.encode("x"),
        },
      ]),
    );

    expect(archive.entries[0]?.name).toBe("Café Tacvba.mp3");
  });

  it("nombre UTF-8 (flag bit 11) se decodifica con acentos", () => {
    const archive = readZip(
      buildZipEntries([
        { name: "Ñandú.mp3", payload: encoder.encode("x") },
      ]),
    );
    expect(archive.entries[0]?.name).toBe("Ñandú.mp3");
  });
});
