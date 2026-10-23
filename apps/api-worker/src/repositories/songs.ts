/**
 * Acceso a datos de canciones (espejo de `features/songs/repository.py`).
 *
 * `SongRead` necesita artista, álbum (con su artista) y colaboradores: se
 * cargan con un loader batcheado de 3 queries (canciones+artista,
 * álbumes+artista, colaboradores+artista), no con una query por relación. Las
 * listas nunca hacen N+1 y el álbum SIEMPRE queda resuelto (null explícito si
 * no hay).
 *
 * Escrituras compuestas (canción + colaboradores, reemplazo del set) van en UN
 * `db.batch`: el driver HTTP de Neon no soporta transacciones interactivas,
 * pero un batch viaja como una sola transacción al servidor.
 */

import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import {
  albums,
  artists,
  playlistSongs,
  songCollaborators,
  songs,
  userFavorites,
  type AlbumRow,
  type ArtistRow,
  type NewSongRow,
  type SongRow,
} from "@/db/schema";
import type { AppConfig } from "@/env";

/** Canción + relaciones eager-loaded (contrato de `SongInput`). */
export type SongWithRelations = SongRow & {
  artist: ArtistRow;
  album: (AlbumRow & { artist: ArtistRow }) | null;
  collaborators: ArtistRow[];
};

/** Columnas que la API puede escribir en una canción existente. */
export type SongPatch = Partial<
  Pick<
    NewSongRow,
    | "title"
    | "artistId"
    | "albumId"
    | "genres"
    | "lyrics"
    | "durationSeconds"
  >
>;

export interface SongFilters {
  search?: string | null;
  artistId?: string | null;
  collaboratorId?: string | null;
  albumId?: string | null;
  playlistId?: string | null;
}

function songConditions(filters: SongFilters) {
  const conditions = [];
  if (filters.search) {
    conditions.push(sql`${songs.title} ILIKE ${`%${filters.search}%`}`);
  }
  if (filters.artistId) {
    conditions.push(eq(songs.artistId, filters.artistId));
  }
  if (filters.collaboratorId) {
    // Colaboraciones: el artista participa pero NO es el principal. Sin
    // `distinct`: la PK (song_id, artist_id) no duplica filas y `distinct`
    // sobre `songs.*` rompe en Postgres por la columna JSON.
    conditions.push(eq(songCollaborators.artistId, filters.collaboratorId));
    conditions.push(ne(songs.artistId, filters.collaboratorId));
  }
  if (filters.albumId) {
    conditions.push(eq(songs.albumId, filters.albumId));
  }
  if (filters.playlistId) {
    conditions.push(eq(playlistSongs.playlistId, filters.playlistId));
  }
  return conditions;
}

/**
 * Completa las relaciones de las canciones ya traídas (con su artista).
 *
 * Query 2: álbumes referenciados + su artista (deduplicados por id).
 * Query 3: colaboradores de todas las canciones + su artista.
 */
async function loadSongRelations(
  config: AppConfig,
  rows: ReadonlyArray<{ song: SongRow; artist: ArtistRow }>,
): Promise<SongWithRelations[]> {
  if (rows.length === 0) return [];

  const db = createDb(config);
  const albumIds = [
    ...new Set(
      rows.flatMap(({ song }) => (song.albumId ? [song.albumId] : [])),
    ),
  ];
  const songIds = rows.map(({ song }) => song.id);

  const [albumRows, collaboratorRows] = await Promise.all([
    albumIds.length === 0
      ? Promise.resolve([] as Array<{ album: AlbumRow; artist: ArtistRow }>)
      : db
          .select({ album: albums, artist: artists })
          .from(albums)
          .innerJoin(artists, eq(albums.artistId, artists.id))
          .where(inArray(albums.id, albumIds)),
    db
      .select({ songId: songCollaborators.songId, artist: artists })
      .from(songCollaborators)
      .innerJoin(artists, eq(songCollaborators.artistId, artists.id))
      .where(inArray(songCollaborators.songId, songIds)),
  ]);

  const albumMap = new Map(
    albumRows.map(({ album, artist }) => [album.id, { ...album, artist }]),
  );
  const collaboratorsBySong = new Map<string, ArtistRow[]>();
  for (const { songId, artist } of collaboratorRows) {
    const list = collaboratorsBySong.get(songId) ?? [];
    list.push(artist);
    collaboratorsBySong.set(songId, list);
  }

  return rows.map(({ song, artist }) => ({
    ...song,
    artist,
    album: song.albumId ? albumMap.get(song.albumId) ?? null : null,
    collaborators: collaboratorsBySong.get(song.id) ?? [],
  }));
}

/**
 * `GET /songs`: orden `created_at desc`, salvo `playlist_id`, que ordena por
 * `playlist_songs.position asc`.
 *
 * Desempate por `id` en ambos casos: Python no lo tenía y dos canciones con el
 * mismo `created_at` (o dos posiciones iguales) salían en orden arbitrario,
 * rompiendo la paginación estable. Mejora chica y deliberada.
 */
export async function listSongs(
  config: AppConfig,
  filters: SongFilters,
  offset: number,
  limit: number,
): Promise<SongWithRelations[]> {
  const db = createDb(config);

  let query = db
    .select({ song: songs, artist: artists })
    .from(songs)
    .innerJoin(artists, eq(songs.artistId, artists.id))
    .$dynamic();

  if (filters.collaboratorId) {
    query = query.innerJoin(
      songCollaborators,
      eq(songCollaborators.songId, songs.id),
    );
  }
  if (filters.playlistId) {
    query = query.innerJoin(playlistSongs, eq(playlistSongs.songId, songs.id));
  }

  const ordered = filters.playlistId
    ? query.orderBy(asc(playlistSongs.position), asc(songs.id))
    : query.orderBy(desc(songs.createdAt), asc(songs.id));

  const rows = await ordered
    .where(and(...songConditions(filters)))
    .offset(offset)
    .limit(limit);

  return loadSongRelations(config, rows);
}

/** `total` del listado: mismos filtros que `listSongs`. */
export async function countSongs(
  config: AppConfig,
  filters: SongFilters,
): Promise<number> {
  const db = createDb(config);

  let query = db.select({ value: count() }).from(songs).$dynamic();
  if (filters.collaboratorId) {
    query = query.innerJoin(
      songCollaborators,
      eq(songCollaborators.songId, songs.id),
    );
  }
  if (filters.playlistId) {
    query = query.innerJoin(playlistSongs, eq(playlistSongs.songId, songs.id));
  }

  const rows = await query.where(and(...songConditions(filters)));
  return rows[0]?.value ?? 0;
}

export async function findSongById(
  config: AppConfig,
  id: string,
): Promise<SongWithRelations | null> {
  const rows = await createDb(config)
    .select({ song: songs, artist: artists })
    .from(songs)
    .innerJoin(artists, eq(songs.artistId, artists.id))
    .where(eq(songs.id, id))
    .limit(1);

  const [song] = await loadSongRelations(config, rows);
  return song ?? null;
}

/** Fetch batcheado por ids (ranking de populares / recientes). */
export async function findSongsByIds(
  config: AppConfig,
  songIds: readonly string[],
): Promise<SongWithRelations[]> {
  if (songIds.length === 0) return [];

  const rows = await createDb(config)
    .select({ song: songs, artist: artists })
    .from(songs)
    .innerJoin(artists, eq(songs.artistId, artists.id))
    .where(inArray(songs.id, [...songIds]));

  return loadSongRelations(config, rows);
}

/** Títulos de las canciones del álbum (dedupe del import por ZIP). */
export async function findSongTitlesByAlbumId(
  config: AppConfig,
  albumId: string,
): Promise<string[]> {
  const rows = await createDb(config)
    .select({ title: songs.title })
    .from(songs)
    .where(eq(songs.albumId, albumId));
  return rows.map((row) => row.title);
}

/**
 * Canciones de un álbum en orden de creación (detalle de álbum), con desempate
 * por `id` para que el detalle sea determinista (Python no lo tenía).
 */
export async function findSongsByAlbumId(
  config: AppConfig,
  albumId: string,
): Promise<SongWithRelations[]> {
  const rows = await createDb(config)
    .select({ song: songs, artist: artists })
    .from(songs)
    .innerJoin(artists, eq(songs.artistId, artists.id))
    .where(eq(songs.albumId, albumId))
    .orderBy(asc(songs.createdAt), asc(songs.id));

  return loadSongRelations(config, rows);
}

/**
 * Canciones de una playlist en orden de posición (detalle).
 *
 * Desempate por `id` para que dos posiciones iguales (dato legacy) no salgan en
 * orden arbitrario; el camino normal ya lo garantiza la posición 0..n-1.
 */
export async function findSongsByPlaylistId(
  config: AppConfig,
  playlistId: string,
): Promise<SongWithRelations[]> {
  const rows = await createDb(config)
    .select({ song: songs, artist: artists })
    .from(playlistSongs)
    .innerJoin(songs, eq(playlistSongs.songId, songs.id))
    .innerJoin(artists, eq(songs.artistId, artists.id))
    .where(eq(playlistSongs.playlistId, playlistId))
    .orderBy(asc(playlistSongs.position), asc(songs.id));

  return loadSongRelations(config, rows);
}

/**
 * Canciones favoritas del usuario, ordenadas por fecha del like (más recientes
 * primero) — `GET /me/favorites`.
 */
export async function findSongsFavoritedByUser(
  config: AppConfig,
  userId: string,
  offset: number,
  limit: number,
): Promise<SongWithRelations[]> {
  const rows = await createDb(config)
    .select({ song: songs, artist: artists })
    .from(userFavorites)
    .innerJoin(songs, eq(userFavorites.songId, songs.id))
    .innerJoin(artists, eq(songs.artistId, artists.id))
    .where(eq(userFavorites.userId, userId))
    .orderBy(desc(userFavorites.createdAt), asc(songs.id))
    .offset(offset)
    .limit(limit);

  return loadSongRelations(config, rows);
}

/** IDs de las canciones más nuevas (snapshot `new` de playlists system). */
export async function listNewestSongIds(
  config: AppConfig,
  limit: number,
): Promise<string[]> {
  const rows = await createDb(config)
    .select({ id: songs.id })
    .from(songs)
    .orderBy(desc(songs.createdAt), asc(songs.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

/** `true` si la canción existe (sin traer relaciones): chequeo de PATCH/DELETE. */
export async function songExists(
  config: AppConfig,
  id: string,
): Promise<boolean> {
  const rows = await createDb(config)
    .select({ id: songs.id })
    .from(songs)
    .where(eq(songs.id, id))
    .limit(1);
  return rows.length > 0;
}

/** `NewSongRow` con el id ya generado por el service. */
export type NewSongWithId = NewSongRow & { id: string };

/**
 * INSERT de la canción + sus colaboradores en UNA transacción.
 *
 * El driver HTTP de Neon no soporta transacciones interactivas, pero
 * `db.batch` ejecuta todas las sentencias en una sola transacción del lado del
 * servidor: si el INSERT de colaboradores falla (FK/PK), la canción no queda
 * creada. Sin colaboradores el batch es de una sola sentencia.
 */
export async function createSongWithCollaborators(
  config: AppConfig,
  values: NewSongWithId,
  artistIds: readonly string[],
): Promise<SongRow> {
  const db = createDb(config);
  const insertSong = db.insert(songs).values(values).returning();

  const [created] =
    artistIds.length === 0
      ? await db.batch([insertSong] as const)
      : await db.batch([
          insertSong,
          db
            .insert(songCollaborators)
            .values(artistIds.map((artistId) => ({ songId: values.id, artistId }))),
        ] as const);

  const row = created[0];
  if (!row) throw new Error("INSERT de canción no devolvió fila");
  return row;
}

/**
 * UPDATE parcial + `updated_at` con `now()` de Postgres (el `onupdate` de
 * SQLAlchemy del backend Python ya no existe acá).
 */
export async function updateSong(
  config: AppConfig,
  id: string,
  patch: SongPatch,
): Promise<SongRow | null> {
  if (Object.keys(patch).length === 0) {
    const rows = await createDb(config)
      .select()
      .from(songs)
      .where(eq(songs.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  const rows = await createDb(config)
    .update(songs)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(songs.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteSong(config: AppConfig, id: string): Promise<void> {
  await createDb(config).delete(songs).where(eq(songs.id, id));
}

/**
 * Reemplaza los colaboradores (delete + insert en el MISMO batch).
 *
 * Antes eran dos sentencias sueltas: si el INSERT fallaba, la canción quedaba
 * sin colaboradores (se perdía el set viejo a medias). Con `db.batch` el
 * delete y el insert viajan como una transacción: o queda el set nuevo
 * completo, o queda el viejo intacto.
 */
export async function setSongCollaborators(
  config: AppConfig,
  songId: string,
  artistIds: readonly string[],
): Promise<void> {
  const db = createDb(config);
  const remove = db
    .delete(songCollaborators)
    .where(eq(songCollaborators.songId, songId));

  if (artistIds.length === 0) {
    await db.batch([remove] as const);
    return;
  }

  await db.batch([
    remove,
    db
      .insert(songCollaborators)
      .values(artistIds.map((artistId) => ({ songId, artistId }))),
  ] as const);
}
