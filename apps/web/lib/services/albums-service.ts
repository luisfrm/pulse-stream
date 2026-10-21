import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Album, AlbumDetail, Page } from "./types";

export interface GetAlbumsParams {
  query?: string;
  offset?: number;
  limit?: number;
  artistId?: string;
}

/**
 * Lecturas del catálogo de álbumes para la app. Las mutaciones admin
 * (`create`/`update`/`delete`/`importZip`) viven en `apps/panel`.
 */
export const albumsService = {
  async getAlbums(
    params?: GetAlbumsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Album>> {
    const { query, artistId, ...rest } = params ?? {};
    return await api<Page<Album>>("/albums", {
      query: {
        ...rest,
        ...(query ? { q: query } : {}),
        ...(artistId ? { artist_id: artistId } : {}),
      },
      ...options,
    });
  },

  async getAlbumById(id: string, options?: ApiFetchOptions): Promise<AlbumDetail> {
    return await api<AlbumDetail>(`/albums/${id}`, options);
  },
};
