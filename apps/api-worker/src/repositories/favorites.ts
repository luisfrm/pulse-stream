/**
 * Acceso a datos de favoritos (espejo de `features/favorites/repository.py`).
 *
 * Tres tablas con PK compuesta (user + item) y `created_at` (el orden de
 * listado es por fecha del like, no por título). Los "add" son idempotentes con
 * `ON CONFLICT DO NOTHING` (una sola sentencia) y los "remove" devuelven si
 * había fila, así el service responde 204/404 sin un SELECT previo.
 *
 * Las listas cargan lo justo para `PlaylistRead`/`AlbumRead` en 1 query
 * (+ 1 batcheada de items para playlists): nunca N+1 ni canciones completas.
 */

import { and, asc, count, desc, eq } from "drizzle-orm";

import { createDb } from "@/db/client";
import {
  albums,
  artists,
  playlists,
  songs,
  userFavoriteAlbums,
  userFavoritePlaylists,
  userFavorites,
  users,
  type AlbumRow,
  type ArtistRow,
} from "@/db/schema";
import type { AppConfig } from "@/env";
import type { PlaylistWithOwner } from "@/repositories/playlists";

// --- Canciones --------------------------------------------------------------

export async function listFavoriteSongIds(
  config: AppConfig,
  userId: string,
): Promise<string[]> {
  const rows = await createDb(config)
    .select({ songId: userFavorites.songId })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  return rows.map((row) => row.songId);
}

export async function countFavoriteSongs(
  config: AppConfig,
  userId: string,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  return rows[0]?.value ?? 0;
}

/** Like idempotente (no-op si ya existía). */
export async function addFavoriteSong(
  config: AppConfig,
  userId: string,
  songId: string,
): Promise<void> {
  await createDb(config)
    .insert(userFavorites)
    .values({ userId, songId })
    .onConflictDoNothing();
}

/** `true` si había un like (el service responde 404 si no). */
export async function removeFavoriteSong(
  config: AppConfig,
  userId: string,
  songId: string,
): Promise<boolean> {
  const rows = await createDb(config)
    .delete(userFavorites)
    .where(
      and(eq(userFavorites.userId, userId), eq(userFavorites.songId, songId)),
    )
    .returning({ songId: userFavorites.songId });
  return rows.length > 0;
}

// --- Playlists --------------------------------------------------------------

export async function listFavoritePlaylistIds(
  config: AppConfig,
  userId: string,
): Promise<string[]> {
  const rows = await createDb(config)
    .select({ playlistId: userFavoritePlaylists.playlistId })
    .from(userFavoritePlaylists)
    .where(eq(userFavoritePlaylists.userId, userId));
  return rows.map((row) => row.playlistId);
}

export async function countFavoritePlaylists(
  config: AppConfig,
  userId: string,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(userFavoritePlaylists)
    .where(eq(userFavoritePlaylists.userId, userId));
  return rows[0]?.value ?? 0;
}

/**
 * Playlists likeadas, más recientes primero, con dueño para `owner_email`.
 * Los items (`song_count`) los carga el service con una query batcheada.
 */
export async function listFavoritePlaylists(
  config: AppConfig,
  userId: string,
  offset: number,
  limit: number,
): Promise<PlaylistWithOwner[]> {
  const rows = await createDb(config)
    .select({ playlist: playlists, ownerEmail: users.email })
    .from(userFavoritePlaylists)
    .innerJoin(playlists, eq(userFavoritePlaylists.playlistId, playlists.id))
    .innerJoin(users, eq(playlists.ownerId, users.id))
    .where(eq(userFavoritePlaylists.userId, userId))
    .orderBy(
      desc(userFavoritePlaylists.createdAt),
      asc(playlists.id),
    )
    .offset(offset)
    .limit(limit);

  return rows.map(({ playlist, ownerEmail }) => ({
    ...playlist,
    ownerEmail,
  }));
}

export async function addFavoritePlaylist(
  config: AppConfig,
  userId: string,
  playlistId: string,
): Promise<void> {
  await createDb(config)
    .insert(userFavoritePlaylists)
    .values({ userId, playlistId })
    .onConflictDoNothing();
}

export async function removeFavoritePlaylist(
  config: AppConfig,
  userId: string,
  playlistId: string,
): Promise<boolean> {
  const rows = await createDb(config)
    .delete(userFavoritePlaylists)
    .where(
      and(
        eq(userFavoritePlaylists.userId, userId),
        eq(userFavoritePlaylists.playlistId, playlistId),
      ),
    )
    .returning({ playlistId: userFavoritePlaylists.playlistId });
  return rows.length > 0;
}

// --- Álbumes ----------------------------------------------------------------

export async function listFavoriteAlbumIds(
  config: AppConfig,
  userId: string,
): Promise<string[]> {
  const rows = await createDb(config)
    .select({ albumId: userFavoriteAlbums.albumId })
    .from(userFavoriteAlbums)
    .where(eq(userFavoriteAlbums.userId, userId));
  return rows.map((row) => row.albumId);
}

export async function countFavoriteAlbums(
  config: AppConfig,
  userId: string,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(userFavoriteAlbums)
    .where(eq(userFavoriteAlbums.userId, userId));
  return rows[0]?.value ?? 0;
}

/** Álbum likeado + artista + `song_count` (LEFT JOIN agrupado, sin N+1). */
export interface FavoriteAlbumRow {
  album: AlbumRow;
  artist: ArtistRow;
  songCount: number;
}

export async function listFavoriteAlbums(
  config: AppConfig,
  userId: string,
  offset: number,
  limit: number,
): Promise<FavoriteAlbumRow[]> {
  const rows = await createDb(config)
    .select({
      album: albums,
      artist: artists,
      songCount: count(songs.id),
    })
    .from(userFavoriteAlbums)
    .innerJoin(albums, eq(userFavoriteAlbums.albumId, albums.id))
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .leftJoin(songs, eq(songs.albumId, albums.id))
    .where(eq(userFavoriteAlbums.userId, userId))
    .groupBy(albums.id, artists.id, userFavoriteAlbums.createdAt)
    .orderBy(desc(userFavoriteAlbums.createdAt), asc(albums.id))
    .offset(offset)
    .limit(limit);

  return rows;
}

export async function addFavoriteAlbum(
  config: AppConfig,
  userId: string,
  albumId: string,
): Promise<void> {
  await createDb(config)
    .insert(userFavoriteAlbums)
    .values({ userId, albumId })
    .onConflictDoNothing();
}

export async function removeFavoriteAlbum(
  config: AppConfig,
  userId: string,
  albumId: string,
): Promise<boolean> {
  const rows = await createDb(config)
    .delete(userFavoriteAlbums)
    .where(
      and(
        eq(userFavoriteAlbums.userId, userId),
        eq(userFavoriteAlbums.albumId, albumId),
      ),
    )
    .returning({ albumId: userFavoriteAlbums.albumId });
  return rows.length > 0;
}
