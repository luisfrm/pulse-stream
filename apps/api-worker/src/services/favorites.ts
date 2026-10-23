/**
 * Reglas de negocio de favoritos (espejo de `features/favorites/service.py`).
 *
 * Tres tipos de like (canciones, playlists y álbumes). El like de una playlist
 * es una acción de usuario normal y NUNCA muta su contenido: las `system` solo
 * las toca un admin (regla del service de playlists).
 *
 * Idempotencia: PUT repetido es 204 (ON CONFLICT DO NOTHING); DELETE de algo
 * que no estaba es 404 con el mismo mensaje que Python.
 */

import type { UserRow } from "@/db/schema";
import type { AppConfig } from "@/env";
import {
  AlbumNotFoundError,
  PlaylistForbiddenError,
  PlaylistNotFoundError,
  SongNotFoundError,
} from "@/lib/errors";
import { findAlbumById } from "@/repositories/albums";
import {
  addFavoriteAlbum,
  addFavoritePlaylist,
  addFavoriteSong,
  countFavoriteAlbums,
  countFavoritePlaylists,
  countFavoriteSongs,
  listFavoriteAlbumIds,
  listFavoriteAlbums,
  listFavoritePlaylistIds,
  listFavoritePlaylists,
  listFavoriteSongIds,
  removeFavoriteAlbum,
  removeFavoritePlaylist,
  removeFavoriteSong,
  type FavoriteAlbumRow,
} from "@/repositories/favorites";
import {
  findPlaylistWithOwner,
  type PlaylistWithItems,
} from "@/repositories/playlists";
import {
  findSongsFavoritedByUser,
  songExists,
  type SongWithRelations,
} from "@/repositories/songs";
import { withItems } from "@/services/playlists";

export interface FavoriteSongsPage {
  items: SongWithRelations[];
  total: number;
}

export interface FavoritePlaylistsPage {
  items: PlaylistWithItems[];
  total: number;
}

export interface FavoriteAlbumsPage {
  items: FavoriteAlbumRow[];
  total: number;
}

/** Los 3 sets de likes (el route los devuelve ordenados). */
export interface LibraryIds {
  songIds: string[];
  albumIds: string[];
  playlistIds: string[];
}

// --- Canciones --------------------------------------------------------------

export async function listFavoriteSongsPage(
  config: AppConfig,
  user: UserRow,
  offset: number,
  limit: number,
): Promise<FavoriteSongsPage> {
  const [items, total] = await Promise.all([
    findSongsFavoritedByUser(config, user.id, offset, limit),
    countFavoriteSongs(config, user.id),
  ]);
  return { items, total };
}

/** IDs de canciones favoritas, ordenados (para pintar corazones). */
export async function favoriteSongIds(
  config: AppConfig,
  user: UserRow,
): Promise<string[]> {
  return (await listFavoriteSongIds(config, user.id)).sort();
}

export async function addFavoriteSongRecord(
  config: AppConfig,
  user: UserRow,
  songId: string,
): Promise<void> {
  // La existencia se valida contra `songs` (el like no crea la canción).
  if (!(await songExists(config, songId))) {
    throw new SongNotFoundError(songId);
  }
  await addFavoriteSong(config, user.id, songId);
}

export async function removeFavoriteSongRecord(
  config: AppConfig,
  user: UserRow,
  songId: string,
): Promise<void> {
  const removed = await removeFavoriteSong(config, user.id, songId);
  if (!removed) throw new SongNotFoundError(songId);
}

// --- Playlists --------------------------------------------------------------

export async function listFavoritePlaylistsPage(
  config: AppConfig,
  user: UserRow,
  offset: number,
  limit: number,
): Promise<FavoritePlaylistsPage> {
  const [playlists, total] = await Promise.all([
    listFavoritePlaylists(config, user.id, offset, limit),
    countFavoritePlaylists(config, user.id),
  ]);
  const items = await withItems(config, playlists);
  return { items, total };
}

export async function favoritePlaylistIds(
  config: AppConfig,
  user: UserRow,
): Promise<string[]> {
  return (await listFavoritePlaylistIds(config, user.id)).sort();
}

/**
 * Like a una playlist (de usuario o del sistema).
 *
 * Regla de visibilidad: la playlist tiene que existir (404) y ser visible para
 * el usuario — pública de cualquiera o propia, pública o privada (si no, 403).
 * El like NO toca el contenido.
 */
export async function addFavoritePlaylistRecord(
  config: AppConfig,
  user: UserRow,
  playlistId: string,
): Promise<void> {
  const playlist = await findPlaylistWithOwner(config, playlistId);
  if (!playlist) throw new PlaylistNotFoundError(playlistId);
  if (!playlist.isPublic && playlist.ownerId !== user.id) {
    throw new PlaylistForbiddenError();
  }
  await addFavoritePlaylist(config, user.id, playlistId);
}

export async function removeFavoritePlaylistRecord(
  config: AppConfig,
  user: UserRow,
  playlistId: string,
): Promise<void> {
  const removed = await removeFavoritePlaylist(config, user.id, playlistId);
  if (!removed) throw new PlaylistNotFoundError(playlistId);
}

// --- Álbumes ----------------------------------------------------------------

export async function listFavoriteAlbumsPage(
  config: AppConfig,
  user: UserRow,
  offset: number,
  limit: number,
): Promise<FavoriteAlbumsPage> {
  const [items, total] = await Promise.all([
    listFavoriteAlbums(config, user.id, offset, limit),
    countFavoriteAlbums(config, user.id),
  ]);
  return { items, total };
}

export async function favoriteAlbumIds(
  config: AppConfig,
  user: UserRow,
): Promise<string[]> {
  return (await listFavoriteAlbumIds(config, user.id)).sort();
}

export async function addFavoriteAlbumRecord(
  config: AppConfig,
  user: UserRow,
  albumId: string,
): Promise<void> {
  const album = await findAlbumById(config, albumId);
  if (!album) throw new AlbumNotFoundError(albumId);
  await addFavoriteAlbum(config, user.id, albumId);
}

export async function removeFavoriteAlbumRecord(
  config: AppConfig,
  user: UserRow,
  albumId: string,
): Promise<void> {
  const removed = await removeFavoriteAlbum(config, user.id, albumId);
  if (!removed) throw new AlbumNotFoundError(albumId);
}

// --- Biblioteca consolidada -------------------------------------------------

/**
 * Los 3 sets de likes en 3 queries (una por tabla), sin traer las listas.
 * El route los ordena antes de responder.
 */
export async function libraryIds(
  config: AppConfig,
  user: UserRow,
): Promise<LibraryIds> {
  const [songIds, albumIds, playlistIds] = await Promise.all([
    listFavoriteSongIds(config, user.id),
    listFavoriteAlbumIds(config, user.id),
    listFavoritePlaylistIds(config, user.id),
  ]);

  return {
    songIds: songIds.sort(),
    albumIds: albumIds.sort(),
    playlistIds: playlistIds.sort(),
  };
}
