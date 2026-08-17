import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Page, Song } from "./types";

export interface GetFavoritesParams {
  offset?: number;
  limit?: number;
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

  /** IDs favoritos (para pintar corazones sin traer todo el catálogo). */
  async getFavoriteIds(options?: ApiFetchOptions): Promise<string[]> {
    return await api<string[]>("/me/favorites/ids", {
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
};
