/**
 * Reglas de negocio de canciones (espejo de `features/songs/service.py`).
 *
 * Sin HTTP: reciben el `AppConfig` del request y lanzan errores de dominio que
 * `onError` traduce al body de FastAPI. Los routers solo parsean y delegan.
 *
 * Escrituras: el driver HTTP de Neon no tiene transacciones interactivas, así
 * que el orden importa. Toda validación que puede fallar corre ANTES de
 * escribir, y lo que debe ser atómico (canción + colaboradores, reemplazo del
 * set) va en un solo `db.batch` (una transacción del lado del servidor).
 */

import type { AppConfig } from "@/env";
import {
  AlbumNotFoundError,
  AlbumRequiredError,
  ArtistNotFoundError,
  SongNotFoundError,
} from "@/lib/errors";
import {
  createArtist,
  deleteArtist,
  findArtistById,
  findArtistIds,
  findArtistByName,
} from "@/repositories/artists";
import { findAlbumById } from "@/repositories/albums";
import {
  countSongs,
  createSongWithCollaborators,
  deleteSong,
  findSongById,
  findSongsByIds,
  listSongs,
  setSongCollaborators,
  songExists,
  topSongIds,
  updateSong,
  type SongFilters,
  type SongPatch,
  type SongWithRelations,
} from "@/repositories/songs";
import type { SongCreate, SongUpdate } from "@/schemas";

export interface SongListPage {
  items: SongWithRelations[];
  total: number;
}

export interface PopularSong {
  song: SongWithRelations;
  plays: number;
}

export async function listSongPage(
  config: AppConfig,
  filters: SongFilters,
  offset: number,
  limit: number,
): Promise<SongListPage> {
  const [items, total] = await Promise.all([
    listSongs(config, filters, offset, limit),
    countSongs(config, filters),
  ]);
  return { items, total };
}

export async function getSongOr404(
  config: AppConfig,
  songId: string,
): Promise<SongWithRelations> {
  const song = await findSongById(config, songId);
  if (!song) throw new SongNotFoundError(songId);
  return song;
}

/** Existencia sin cargar relaciones (PATCH/DELETE no necesitan el DTO). */
async function assertSongExists(
  config: AppConfig,
  songId: string,
): Promise<void> {
  if (!(await songExists(config, songId))) throw new SongNotFoundError(songId);
}

async function assertArtistExists(
  config: AppConfig,
  artistId: string,
): Promise<void> {
  const artist = await findArtistById(config, artistId);
  if (!artist) throw new ArtistNotFoundError(artistId);
}

async function assertAlbumExists(
  config: AppConfig,
  albumId: string,
): Promise<void> {
  const album = await findAlbumById(config, albumId);
  if (!album) throw new AlbumNotFoundError(albumId);
}

/**
 * Valida TODOS los colaboradores con UNA query (`inArray`) y reporta el primer
 * id faltante en el orden del body (mismo `detail` que antes, sin el N+1 de
 * una query por id).
 */
async function assertCollaboratorsExist(
  config: AppConfig,
  artistIds: readonly string[],
): Promise<void> {
  if (artistIds.length === 0) return;

  const found = new Set(await findArtistIds(config, artistIds));
  const missing = artistIds.find((artistId) => !found.has(artistId));
  if (missing !== undefined) throw new ArtistNotFoundError(missing);
}

/**
 * Quita ids repetidos preservando el orden del body.
 *
 * `song_collaborators` tiene PK (song_id, artist_id): mandar el mismo artista
 * dos veces rompería el INSERT con un 500 en vez de ser un no-op.
 */
function uniqueIds(artistIds: readonly string[]): string[] {
  return [...new Set(artistIds)];
}

/**
 * `POST /songs`: si llega `artist_name` sin `artist_id`, el artista se crea
 * inline (lookup case-insensitive primero, para no duplicarlo).
 *
 * Ese INSERT inline es la única sentencia que no puede ir en el batch de la
 * canción. Para no dejar un artista huérfano se valida primero TODO lo que
 * puede fallar (álbum y colaboradores) y, si el alta de la canción falla
 * igual, el artista recién creado se borra en el `catch` (compensación).
 */
export async function createSongRecord(
  config: AppConfig,
  payload: SongCreate,
): Promise<SongWithRelations> {
  const collaboratorIds = uniqueIds(payload.collaborator_ids ?? []);

  // 1) Validaciones ANTES de cualquier escritura.
  await assertAlbumExists(config, payload.album_id);
  await assertCollaboratorsExist(config, collaboratorIds);

  // 2) Artista: existente, reusado por nombre (case-insensitive) o nuevo.
  let artistId: string;
  let inlineArtistId: string | null = null;
  const requestedArtistId = payload.artist_id ?? null;

  if (requestedArtistId !== null) {
    await assertArtistExists(config, requestedArtistId);
    artistId = requestedArtistId;
  } else {
    const name = payload.artist_name ?? "";
    const existing = await findArtistByName(config, name);
    if (existing) {
      artistId = existing.id;
    } else {
      const artist = await createArtist(config, {
        id: crypto.randomUUID(),
        name,
      });
      artistId = artist.id;
      inlineArtistId = artist.id;
    }
  }

  // 3) Canción + colaboradores: un solo batch = una transacción.
  const songId = crypto.randomUUID();
  try {
    await createSongWithCollaborators(
      config,
      {
        id: songId,
        title: payload.title,
        artistId,
        albumId: payload.album_id,
        genres: payload.genres ?? [],
        lyrics: payload.lyrics ?? null,
        objectKey: payload.object_key,
        durationSeconds: payload.duration_seconds ?? null,
      },
      collaboratorIds,
    );
  } catch (error) {
    // Compensación: el artista inline lo creó este request y quedó sin uso.
    if (inlineArtistId !== null) {
      await deleteArtist(config, inlineArtistId).catch(() => undefined);
    }
    throw error;
  }

  return getSongOr404(config, songId);
}

/**
 * `PATCH /songs/{id}` con semántica de presencia (`exclude_unset`):
 *   - `album_id` presente y `null` -> 400 AlbumRequiredError;
 *   - `artist_id` presente y no nulo -> se valida;
 *   - `collaborator_ids` presente (aunque sea `[]` o `null`) -> reemplaza el set;
 *   - el resto se aplica solo si la clave vino en el body.
 *
 * El UPDATE de la canción va ANTES del reemplazo de colaboradores: si el
 * UPDATE falla, el set viejo queda intacto (el reemplazo es un batch aparte).
 */
export async function updateSongRecord(
  config: AppConfig,
  songId: string,
  payload: SongUpdate,
): Promise<SongWithRelations> {
  await assertSongExists(config, songId);

  const patch: SongPatch = {};

  if (payload.artist_id !== undefined && payload.artist_id !== null) {
    await assertArtistExists(config, payload.artist_id);
    patch.artistId = payload.artist_id;
  }

  if (payload.album_id !== undefined) {
    if (payload.album_id === null) throw new AlbumRequiredError();
    await assertAlbumExists(config, payload.album_id);
    patch.albumId = payload.album_id;
  }

  if (payload.title !== undefined && payload.title !== null) {
    patch.title = payload.title;
  }
  if (payload.genres !== undefined && payload.genres !== null) {
    patch.genres = payload.genres;
  }
  if (payload.lyrics !== undefined) patch.lyrics = payload.lyrics;
  if (payload.duration_seconds !== undefined) {
    patch.durationSeconds = payload.duration_seconds;
  }

  // `null` explícito limpia el set, igual que `[]` (Python: `or []`).
  const replacedCollaborators =
    payload.collaborator_ids !== undefined
      ? uniqueIds(payload.collaborator_ids ?? [])
      : null;
  if (replacedCollaborators !== null) {
    await assertCollaboratorsExist(config, replacedCollaborators);
  }

  await updateSong(config, songId, patch);

  if (replacedCollaborators !== null) {
    await setSongCollaborators(config, songId, replacedCollaborators);
  }

  return getSongOr404(config, songId);
}

export async function deleteSongRecord(
  config: AppConfig,
  songId: string,
): Promise<void> {
  await assertSongExists(config, songId);
  await deleteSong(config, songId);
}

/** Inicio del mes calendario actual en UTC (ventana de `month=true`). */
function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * `GET /songs/popular`: ranking por `listens` en la ventana pedida.
 * `play_count` de cada item es el count de la VENTANA, no `songs.play_count`.
 */
export async function listPopularSongs(
  config: AppConfig,
  options: { limit: number; days: number; month: boolean },
): Promise<PopularSong[]> {
  const now = new Date();
  const since = options.month
    ? startOfUtcMonth(now)
    : new Date(now.getTime() - options.days * 24 * 60 * 60 * 1000);

  const ranking = await topSongIds(config, since, options.limit);
  const songs = await findSongsByIds(
    config,
    ranking.map(({ songId }) => songId),
  );
  const byId = new Map(songs.map((song) => [song.id, song]));

  return ranking.flatMap(({ songId, plays }) => {
    const song = byId.get(songId);
    return song ? [{ song, plays }] : [];
  });
}
