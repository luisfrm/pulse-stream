import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Artist, Page } from "./types";

export interface GetArtistsParams {
  query?: string;
  offset?: number;
  limit?: number;
}

/**
 * Lecturas del catálogo de artistas para la app. Las mutaciones admin
 * (`createArtist`/`updateArtist`/`deleteArtist`) viven en `apps/panel`.
 */
export const artistsService = {
  /**
   * Lista paginada/filtrada. En RSC se pasa `options` con
   * `next: { revalidate, tags }` para cachear el catálogo público.
   */
  async getArtists(
    params?: GetArtistsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Artist>> {
    const { query, ...rest } = params ?? {};
    return await api<Page<Artist>>("/artists", {
      query: {
        ...rest,
        // La API espera `q` para la búsqueda por nombre.
        ...(query ? { q: query } : {}),
      },
      ...options,
    });
  },

  async getArtistById(id: string, options?: ApiFetchOptions): Promise<Artist> {
    return await api<Artist>(`/artists/${id}`, options);
  },
};
