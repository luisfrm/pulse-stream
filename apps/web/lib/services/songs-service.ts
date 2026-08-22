import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Page, Song, SongWithPlays } from "./types";

export interface GetSongsParams {
  query?: string;
  offset?: number;
  limit?: number;
  artistId?: string;
  /** Canciones donde el artista es colaborador (no principal). */
  collaboratorId?: string;
  albumId?: string;
  playlistId?: string;
}

export interface GetPopularParams {
  limit?: number;
  days?: number;
  /** Usar el mes calendario actual (UTC) en vez de `days`. */
  month?: boolean;
}

export interface CreateSongPayload {
  title: string;
  artist_id?: string;
  artist_name?: string;
  album_id?: string;
  genres: string[];
  lyrics?: string;
  object_key: string;
  cover_key?: string;
  collaborator_ids?: string[];
}

export interface UpdateSongPayload {
  title?: string;
  artist_id?: string;
  /** null = quitar la canción del álbum. */
  album_id?: string | null;
  genres?: string[];
  lyrics?: string;
  duration_seconds?: number;
  cover_key?: string;
  collaborator_ids?: string[];
}

export const songsService = {
  async getSongs(
    params?: GetSongsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Song>> {
    const { artistId, collaboratorId, albumId, playlistId, query, ...rest } = params ?? {};
    return await api<Page<Song>>("/songs", {
      query: {
        ...rest,
        // La API espera `q` para la búsqueda por título (y snake_case para
        // los ids): sin este mapeo el backend ignora el filtro y devuelve
        // todo el catálogo (bug del buscador de /songs y /search).
        ...(query ? { q: query } : {}),
        ...(artistId ? { artist_id: artistId } : {}),
        ...(collaboratorId ? { collaborator_id: collaboratorId } : {}),
        ...(albumId ? { album_id: albumId } : {}),
        ...(playlistId ? { playlist_id: playlistId } : {}),
      },
      ...options,
    });
  },

  async getSongById(id: string, options?: ApiFetchOptions): Promise<Song> {
    return await api<Song>(`/songs/${id}`, options);
  },

  /** Top canciones por reproducciones (ranking público del dashboard). */
  async getPopular(
    params?: GetPopularParams,
    options?: ApiFetchOptions,
  ): Promise<SongWithPlays[]> {
    return await api<SongWithPlays[]>("/songs/popular", {
      query: params,
      ...options,
    });
  },

  async createSong(payload: CreateSongPayload): Promise<Song> {
    return await api<Song>("/songs", {
      method: "POST",
      body: payload,
    });
  },

  async updateSong(id: string, payload: UpdateSongPayload): Promise<Song> {
    return await api<Song>(`/songs/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteSong(id: string): Promise<void> {
    await api(`/songs/${id}`, { method: "DELETE" });
  },
};
