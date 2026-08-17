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

  async createArtist(name: string): Promise<Artist> {
    return await api<Artist>("/artists", {
      method: "POST",
      body: { name },
    });
  },

  async deleteArtist(id: string): Promise<void> {
    await api(`/artists/${id}`, { method: "DELETE" });
  },
};
