import { panelApi, type ApiFetchOptions } from "@/lib/api/client";
import type { Artist, Page } from "./types";

export interface GetArtistsParams {
  query?: string;
  offset?: number;
  limit?: number;
}

/** Servicio admin de artistas (+ lecturas del panel). */
export const artistsService = {
  async getArtists(
    params?: GetArtistsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Artist>> {
    const { query, ...rest } = params ?? {};
    return await panelApi<Page<Artist>>("/artists", {
      query: {
        ...rest,
        // La API espera `q` para la búsqueda por nombre.
        ...(query ? { q: query } : {}),
      },
      ...options,
    });
  },

  async getArtistById(id: string, options?: ApiFetchOptions): Promise<Artist> {
    return await panelApi<Artist>(`/artists/${id}`, options);
  },

  async createArtist(name: string, coverKey?: string): Promise<Artist> {
    return await panelApi<Artist>("/artists", {
      method: "POST",
      body: { name, ...(coverKey ? { cover_key: coverKey } : {}) },
    });
  },

  async updateArtist(
    id: string,
    payload: { name?: string; cover_key?: string },
  ): Promise<Artist> {
    return await panelApi<Artist>(`/artists/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteArtist(id: string): Promise<void> {
    await panelApi(`/artists/${id}`, { method: "DELETE" });
  },
};
