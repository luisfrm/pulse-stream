import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Album, Page, Playlist, Song } from "./types";

export interface GetFavoritesParams {
  offset?: number;
  limit?: number;
}

/** Los 3 sets de likes del usuario en una sola llamada (GET /me/library/ids). */
export interface LibraryIds {
  song_ids: string[];
  album_ids: string[];
  playlist_ids: string[];
}

export const favoritesService = {
  /** Canciones favoritas del usuario (paginadas). */
  async getFavorites(
    params?: GetFavoritesParams,
    options?: ApiFetchOptions
  ): Promise<Page<Song>> {
    return await api<Page<Song>>("/me/favorites", {
      query: params,
      ...options,
    });
  },

  /** Álbumes favoritos del usuario (paginados, más recientes primero). */
  async getFavoriteAlbums(
    params?: GetFavoritesParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Album>> {
    return await api<Page<Album>>("/me/favorites/albums", {
      query: params,
      cache: "no-store",
      ...options,
    });
  },

  /** Playlists favoritas (de usuario y del sistema), paginadas. */
  async getFavoritePlaylists(
    params?: GetFavoritesParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Playlist>> {
    return await api<Page<Playlist>>("/me/favorites/playlists", {
      query: params,
      cache: "no-store",
      ...options,
    });
  },

  /** Los 3 sets de IDs (songs/albums/playlists) en una sola llamada. */
  async getLibraryIds(options?: ApiFetchOptions): Promise<LibraryIds> {
    return await api<LibraryIds>("/me/library/ids", {
      cache: "no-store",
      ...options,
    });
  },

  async add(songId: string): Promise<void> {
    await api(`/me/favorites/${songId}`, { method: "PUT" });
  },

  async remove(songId: string): Promise<void> {
    await api(`/me/favorites/${songId}`, { method: "DELETE" });
  },

  async addFavoriteAlbum(albumId: string): Promise<void> {
    await api(`/me/favorites/albums/${albumId}`, { method: "PUT" });
  },

  async removeFavoriteAlbum(albumId: string): Promise<void> {
    await api(`/me/favorites/albums/${albumId}`, { method: "DELETE" });
  },

  async addFavoritePlaylist(playlistId: string): Promise<void> {
    await api(`/me/favorites/playlists/${playlistId}`, { method: "PUT" });
  },

  async removeFavoritePlaylist(playlistId: string): Promise<void> {
    await api(`/me/favorites/playlists/${playlistId}`, { method: "DELETE" });
  },
};
