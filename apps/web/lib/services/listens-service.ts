import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { ListenRead, Page, RecentlyPlayedSong } from "./types";

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

  /**
   * Canciones reproducidas por el usuario (sin duplicar), último play primero.
   * Cada item incluye `user_play_count` (veces que la tocó el usuario).
   */
  async getRecentlyPlayed(
    params?: GetRecentlyPlayedParams,
    options?: ApiFetchOptions,
  ): Promise<Page<RecentlyPlayedSong>> {
    return await api<Page<RecentlyPlayedSong>>("/me/recently-played", {
      query: params,
      ...options,
    });
  },
};