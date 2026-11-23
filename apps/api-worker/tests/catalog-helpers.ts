/**
 * Helpers de catálogo para los tests de F4 (equivalen a `_create_artist`,
 * `_create_album` y `_create_song` de `apps/api/tests/test_{albums,songs}.py`).
 *
 * Igual que en Python, un alta que no devuelve el status esperado es un fallo
 * del test (no se sigue con un body inválido).
 *
 * Dos caminos, según qué se testea:
 *   - los `create*` de arriba van por la API: úsalos cuando el ALTA es el
 *     comportamiento bajo test (songs/artists/albums, covers, ZIP, errores);
 *   - `seedCatalogBatch` hace todo en un `db.batch`: úsalo cuando el catálogo
 *     es solo PREPARACIÓN (listens, favoritos, playlists, essentials).
 */

import { createDb } from "@/db/client";
import { albums, artists, songCollaborators, songs } from "@/db/schema";
import type { AlbumDetail, ArtistRead, SongRead } from "@/schemas";

import { testConfig, type TestClient } from "./helpers";

export async function createArtist(
  client: TestClient,
  name: string,
): Promise<ArtistRead> {
  const response = await client.postJson("/artists", { name });
  if (response.status !== 201) {
    throw new Error(
      `POST /artists falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as ArtistRead;
}

export async function createAlbum(
  client: TestClient,
  artistId: string,
  title = "Álbum",
): Promise<AlbumDetail> {
  const response = await client.postJson("/albums", {
    title,
    artist_id: artistId,
  });
  if (response.status !== 201) {
    throw new Error(
      `POST /albums falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as AlbumDetail;
}

export interface CreateSongOptions {
  title: string;
  albumId: string;
  objectKey: string;
  /** Obligatorio uno de los dos: `artistId` (existente) o `artistName`. */
  artistId?: string;
  artistName?: string;
  genres?: string[];
  lyrics?: string;
  durationSeconds?: number;
  collaboratorIds?: string[];
}

export async function createSong(
  client: TestClient,
  options: CreateSongOptions,
): Promise<SongRead> {
  const payload: Record<string, unknown> = {
    title: options.title,
    album_id: options.albumId,
    object_key: options.objectKey,
  };
  if (options.artistId !== undefined) payload.artist_id = options.artistId;
  if (options.artistName !== undefined) payload.artist_name = options.artistName;
  if (options.genres !== undefined) payload.genres = options.genres;
  if (options.lyrics !== undefined) payload.lyrics = options.lyrics;
  if (options.durationSeconds !== undefined) {
    payload.duration_seconds = options.durationSeconds;
  }
  if (options.collaboratorIds !== undefined) {
    payload.collaborator_ids = options.collaboratorIds;
  }

  const response = await client.postJson("/songs", payload);
  if (response.status !== 201) {
    throw new Error(
      `POST /songs falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as SongRead;
}

/** Canción de un lote: solo lo que el arrangement necesita variar. */
export interface SeedSongSpec {
  title?: string;
  playCount?: number;
  /** Géneros de la canción (la API los valida contra el enum; acá van crudos). */
  genres?: string[];
  /** Artistas que ya existen (colaboradores de la canción). */
  collaboratorIds?: string[];
}

export interface SeedCatalogOptions {
  artistName?: string;
  albumTitle?: string;
  songs: SeedSongSpec[];
}

export interface SeededCatalog {
  artistId: string;
  artistName: string;
  albumId: string;
  albumTitle: string;
  songIds: string[];
}

/**
 * Seed de catálogo en UN solo `db.batch` (un único round-trip, una transacción
 * del lado de Neon): artista + álbum + N canciones (+ filas de
 * `song_collaborators`).
 *
 * Existe porque la preparación NO es lo que se testea: los fixtures que solo
 * necesitan que las filas existan pagaban 1 HTTP por canción (~1.4 s de red
 * cada uno). Los tests que prueban el alta siguen usando la API
 * (`createArtist`/`createAlbum`/`createSong`).
 *
 * Las filas son IDÉNTICAS a las que crea la API (replicadas de los services):
 *   - `createArtistRecord` (`services/artists.ts`): `id` uuid, `name`,
 *     `imageUrl: null`, `coverKey: null`;
 *   - `createAlbumRecord` (`services/albums.ts`): `id`, `title`, `artistId`,
 *     `coverKey: null`;
 *   - `createSongRecord` (`services/songs.ts`): `id`, `title`, `artistId`,
 *     `albumId`, `genres` (`[]` por default; el spec puede pedir otros, igual
 *     que `genres` en el body del alta), `lyrics: null`, `objectKey`,
 *     `durationSeconds: null` y `playCount` (en la API es 0 y se sube con un
 *     UPDATE aparte; acá va directo en el INSERT, el resultado es la misma
 *     fila).
 *
 * Única diferencia deliberada: `created_at` explícito y creciente (+1 ms por
 * canción). La API inserta cada canción en su propia transacción (`now()`
 * distinto), así que el orden de creación es determinista; en un batch `now()`
 * es el timestamp de la transacción y el snapshot `new` (created_at desc,
 * desempate por uuid) quedaría aleatorio.
 */
export async function seedCatalogBatch(
  options: SeedCatalogOptions,
): Promise<SeededCatalog> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  const artistId = crypto.randomUUID();
  const artistName = options.artistName ?? `Artista ${suffix}`;
  const albumId = crypto.randomUUID();
  const albumTitle = options.albumTitle ?? `Álbum ${suffix}`;
  const base = Date.now();

  const songRows = options.songs.map((song, index) => ({
    id: crypto.randomUUID(),
    title: song.title ?? `Canción ${index}`,
    artistId,
    albumId,
    genres: song.genres ?? ([] as string[]),
    lyrics: null,
    objectKey: `songs/seed-${suffix}-${index}.mp3`,
    durationSeconds: null,
    playCount: song.playCount ?? 0,
    createdAt: new Date(base + index),
    updatedAt: new Date(base + index),
  }));

  const collaboratorRows = songRows.flatMap((row, index) =>
    (options.songs[index]?.collaboratorIds ?? []).map((collaboratorId) => ({
      songId: row.id,
      artistId: collaboratorId,
    })),
  );

  const db = createDb(testConfig());
  const insertArtist = db.insert(artists).values({
    id: artistId,
    name: artistName,
    imageUrl: null,
    coverKey: null,
  });
  const insertAlbum = db.insert(albums).values({
    id: albumId,
    title: albumTitle,
    artistId,
    coverKey: null,
  });
  const insertSongs =
    songRows.length > 0 ? db.insert(songs).values(songRows) : null;
  const insertCollaborators =
    collaboratorRows.length > 0
      ? db.insert(songCollaborators).values(collaboratorRows)
      : null;

  // Ramas por forma del lote: cada `as const` mantiene el tipado del batch
  // (no admite un array dinámico de sentencias heterogéneas).
  if (insertSongs && insertCollaborators) {
    await db.batch([
      insertArtist,
      insertAlbum,
      insertSongs,
      insertCollaborators,
    ] as const);
  } else if (insertSongs) {
    await db.batch([insertArtist, insertAlbum, insertSongs] as const);
  } else {
    await db.batch([insertArtist, insertAlbum] as const);
  }

  return {
    artistId,
    artistName,
    albumId,
    albumTitle,
    songIds: songRows.map((row) => row.id),
  };
}
