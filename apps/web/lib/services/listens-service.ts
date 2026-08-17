import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { ListenRead, Page, Song } from "./types";

export interface GetRecentlyPlayedParams {
  offset?: number;
  limit?: number;
}

export const listensService = {
  /**
   * Registra una reproducción (play + fecha). Se llama desde el reproductor
   * cuando una canción empieza a sonar; el backend deduplica plays consecutivos.
   */
  async recordPlay(songId: string): Promise<ListenRead> {
    return await api<ListenRead>("/me/listens", {
      method: "POST",
      body: { song_id: songId },
    });
  },

  /** Canciones reproducidas por el usuario (sin duplicar), último play primero. */
  async getRecentlyPlayed(
    params?: GetRecentlyPlayedParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Song>> {
    return await api<Page<Song>>("/me/recently-played", {
      query: params,
      ...options,
    });
  },
};