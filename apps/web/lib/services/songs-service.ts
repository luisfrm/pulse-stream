import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Page, Song } from "./types";

export interface GetSongsParams {
  query?: string;
  offset?: number;
  limit?: number;
  artistId?: string;
}

export interface CreateSongPayload {
  title: string;
  artist_id?: string;
  artist_name?: string;
  genres: string[];
  lyrics?: string;
  object_key: string;
}

export const songsService = {
  async getSongs(
    params?: GetSongsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Song>> {
    const { artistId, ...rest } = params ?? {};
    return await api<Page<Song>>("/songs", {
      query: {
        ...rest,
        // La API espera snake_case (artist_id)
        ...(artistId ? { artist_id: artistId } : {}),
      },
      ...options,
    });
  },

  async getSongById(id: string, options?: ApiFetchOptions): Promise<Song> {
    return await api<Song>(`/songs/${id}`, options);
  },

  async createSong(payload: CreateSongPayload): Promise<Song> {
    return await api<Song>("/songs", {
      method: "POST",
      body: payload,
    });
  },

  async deleteSong(id: string): Promise<void> {
    await api(`/songs/${id}`, { method: "DELETE" });
  },
};
