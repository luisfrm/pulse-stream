/**
 * Import por ZIP de un álbum completo (espejo de `ZipImportService`).
 *
 * Excepción deliberada a "el audio nunca pasa por la API": el ZIP viaja por el
 * Worker (operación admin de carga masiva), pero cada audio se guarda en R2 con
 * un PUT server-side y el registro de la canción se crea recién después.
 *
 * Reglas (idénticas a Python):
 *   - un archivo que falla NO aborta el ZIP: se reporta en `skipped`/`failed`;
 *   - el título SALE DEL NOMBRE (sin extensión, `.strip()`), los tags ID3 se
 *     ignoran a propósito;
 *   - los duplicados (contra la DB y dentro del mismo ZIP) se saltan
 *     comparando títulos en minúsculas (`casefold` en Python);
 *   - el cover no se setea: la canción hereda el del álbum.
 *
 * LÍMITES deliberados (presupuesto de subrequests/CPU de Workers, ver reporte):
 *   - `MAX_AUDIO_ENTRIES` archivos de audio por ZIP; el resto va a `skipped`;
 *   - el álbum y el artista se cargan UNA sola vez y NO se revalidan por
 *     archivo (`createSongRecord` haría 5-6 queries por canción);
 *   - round-trips por canción importada = 1 (INSERT), más 2 fijos al inicio
 *     (álbum+artista y títulos existentes).
 */

import type { AppConfig } from "@/env";
import { probeAudio } from "@/lib/audio";
import {
  AlbumNotFoundError,
  InvalidUploadError,
  R2NotConfiguredError,
} from "@/lib/errors";
import { isDatabaseError } from "@/lib/postgres";
import { IMPORT_EXTENSIONS } from "@/lib/upload-rules";
import { readZip, ZipError } from "@/lib/zip";
import { findAlbumWithArtist } from "@/repositories/albums";
import {
  createSongWithCollaborators,
  findSongTitlesByAlbumId,
  type SongWithRelations,
} from "@/repositories/songs";
import type { ZipImportIssue } from "@/schemas";
import type { R2Storage } from "@/storage/r2";

/**
 * Resultado del import a nivel dominio: las canciones quedan como filas con
 * relaciones (el router las serializa a `SongRead`).
 */
export interface ZipImportSummary {
  imported: SongWithRelations[];
  skipped: ZipImportIssue[];
  failed: ZipImportIssue[];
}

/**
 * Tope de archivos de audio procesados por ZIP.
 *
 * Un álbum real no pasa de ~30 pistas; el tope evita que un ZIP con miles de
 * entradas consuma el presupuesto de subrequests/CPU del Worker. Los que
 * quedan afuera se reportan en `skipped` (no se descartan en silencio).
 */
export const MAX_AUDIO_ENTRIES = 100;

const NOT_AUDIO = "El archivo no es un audio válido.";
const EMPTY_FILE = "El archivo está vacío.";
const NOT_AUDIO_EXTENSION = "No es un archivo .mp3 o .aac.";
const DUPLICATE_TITLE = "Ya existe una canción con ese título en el álbum.";
const UNREADABLE_ENTRY = "No se pudo leer el archivo del ZIP.";
const STORAGE_FAILED = "Error interno al importar el archivo.";
const DB_FAILED = "Error de base de datos al registrar la canción.";
const ZIP_INVALID = "El archivo no es un ZIP válido.";
const TOO_MANY_ENTRIES =
  `Se procesan hasta ${MAX_AUDIO_ENTRIES} archivos por ZIP; ` +
  "este quedó fuera del import.";

/** MB legibles en los mensajes (Python: `size // (1024 * 1024)`). */
function megabytes(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}

/**
 * Valida el tamaño del ZIP (antes de parsearlo).
 *
 * Se usa dos veces: con `content-length` en el route (corta sin bufferear el
 * multipart) y con el largo real ya materializado (autoritativo).
 */
export function assertZipSizeWithinLimit(
  config: AppConfig,
  byteLength: number,
): void {
  if (byteLength > config.r2.maxZipImportBytes) {
    throw new InvalidUploadError(
      "El ZIP supera el tamaño máximo de " +
        `${megabytes(config.r2.maxZipImportBytes)} MB.`,
    );
  }
}

/** `os.path.basename(name) or name`. */
function basename(name: string): string {
  const last = name.split("/").pop() ?? "";
  return last.length > 0 ? last : name;
}

/** Extensión con punto y en minúsculas (`os.path.splitext(name)[1].lower()`). */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/** `os.path.splitext(name)[0].strip() or name`. */
function titleOf(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot <= 0 ? name : name.slice(0, dot);
  const trimmed = base.trim();
  return trimmed.length > 0 ? trimmed : name;
}

/** `str.casefold()` aproximado: el runtime no expone casefold. */
function foldTitle(title: string): string {
  return title.toLowerCase();
}

function issue(name: string, reason: string): ZipImportIssue {
  return { name, reason };
}

/**
 * `POST /albums/{album_id}/import-zip`.
 *
 * Orden: storage → tamaño → ZIP → álbum. Los 400/404/503 cortan todo; los
 * problemas de un archivo se acumulan y el resto se procesa.
 */
export async function importAlbumZip(
  config: AppConfig,
  storage: R2Storage,
  albumId: string,
  zipData: Uint8Array,
): Promise<ZipImportSummary> {
  if (!storage.enabled) throw new R2NotConfiguredError();

  assertZipSizeWithinLimit(config, zipData.byteLength);

  let archive;
  try {
    archive = readZip(zipData);
  } catch {
    // Python: `ZipFile()` levanta BadZipFile para cualquier ZIP que no se pueda
    // abrir (estructura rota incluida). Las entradas cifradas NO caen acá: se
    // resuelven por archivo (ver `read()` de `ZipEntry`).
    throw new InvalidUploadError(ZIP_INVALID);
  }

  // Álbum + artista UNA vez: no se revalida por canción.
  const album = await findAlbumWithArtist(config, albumId);
  if (!album) throw new AlbumNotFoundError(albumId);

  const existingTitles = new Set(
    (await findSongTitlesByAlbumId(config, album.id)).map(foldTitle),
  );

  const imported: SongWithRelations[] = [];
  const skipped: ZipImportIssue[] = [];
  const failed: ZipImportIssue[] = [];
  let uncompressedTotal = 0;
  let audioEntries = 0;

  // Python ordena por `filename` (orden de código); el sort de JS compara
  // unidades UTF-16, equivalente para los nombres ASCII/acentuados del caso.
  const entries = archive.entries
    .filter((entry) => !entry.directory)
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );

  for (const entry of entries) {
    const name = basename(entry.name);
    const extension = extensionOf(name);
    const contentType = IMPORT_EXTENSIONS[extension];

    if (contentType === undefined) {
      skipped.push(issue(name, NOT_AUDIO_EXTENSION));
      continue;
    }
    if (entry.uncompressedSize <= 0) {
      skipped.push(issue(name, EMPTY_FILE));
      continue;
    }
    if (entry.uncompressedSize > config.r2.maxUploadBytes) {
      skipped.push(
        issue(
          name,
          `Supera el máximo de ${megabytes(config.r2.maxUploadBytes)} MB por canción.`,
        ),
      );
      continue;
    }
    if (audioEntries >= MAX_AUDIO_ENTRIES) {
      skipped.push(issue(name, TOO_MANY_ENTRIES));
      continue;
    }
    audioEntries += 1;

    // Protección contra ZIP bomb: el total declarado se valida ANTES de
    // descomprimir; el tamaño real de cada entrada se verifica al inflarla.
    uncompressedTotal += entry.uncompressedSize;
    if (uncompressedTotal > config.r2.maxZipImportBytes) {
      throw new InvalidUploadError(
        "El ZIP descomprimido supera el tamaño máximo de " +
          `${megabytes(config.r2.maxZipImportBytes)} MB.`,
      );
    }

    let data: Uint8Array;
    try {
      data = entry.read();
    } catch {
      // Entrada cifrada, CRC inválido o tamaño que no coincide.
      failed.push(issue(name, UNREADABLE_ENTRY));
      continue;
    }

    const probe = probeAudio(data);
    if (!probe.recognized) {
      failed.push(issue(name, NOT_AUDIO));
      continue;
    }

    const title = titleOf(name);
    if (existingTitles.has(foldTitle(title))) {
      skipped.push(issue(name, DUPLICATE_TITLE));
      continue;
    }

    const objectKey = `songs/${crypto.randomUUID()}${extension}`;

    try {
      // 1) R2 primero: si el PUT falla no se crea el registro.
      await storage.putObject(objectKey, data, contentType);

      // 2) INSERT directo (álbum/artista ya validados arriba).
      const created = await createSongWithCollaborators(
        config,
        {
          id: crypto.randomUUID(),
          title,
          artistId: album.artistId,
          albumId: album.id,
          objectKey,
          durationSeconds: probe.durationSeconds,
        },
        [],
      );

      existingTitles.add(foldTitle(title));
      imported.push({
        ...created,
        artist: album.artist,
        album,
        collaborators: [],
      });
    } catch (error) {
      // Python: DBAPIError/IntegrityError -> mensaje de DB; el resto -> genérico.
      failed.push(issue(name, isDatabaseError(error) ? DB_FAILED : STORAGE_FAILED));
    }
  }

  return { imported, skipped, failed };
}
