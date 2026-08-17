import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Artist, Page } from "./types";

export interface GetArtistsParams {
  query?: string;
  offset?: number;
  limit?: number;
}

export const artistsService = {
  /**
   * Lista paginada/filtrada. En RSC se pasa `options` con
   * `next: { revalidate, tags }` para cachear el catálogo público.
   */
  async getArtists(
    params?: GetArtistsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Artist>> {
    return await api<Page<Artist>>("/artists", {
      query: params,
      ...options,
    });
  },

  async getArtistById(id: string, options?: ApiFetchOptions): Promise<Artist> {
    return await api<Artist>(`/artists/${id}`, options);
  },

  async createArtist(name: string, coverKey?: string): Promise<Artist> {
    return await api<Artist>("/artists", {
      method: "POST",
      body: { name, ...(coverKey ? { cover_key: coverKey } : {}) },
    });
  },

  async updateArtist(
    id: string,
    payload: { name?: string; cover_key?: string },
  ): Promise<Artist> {
    return await api<Artist>(`/artists/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteArtist(id: string): Promise<void> {
    await api(`/artists/${id}`, { method: "DELETE" });
  },
};
