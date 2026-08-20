import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Album, AlbumDetail, Page, ZipImportResult } from "./types";

export interface GetAlbumsParams {
  query?: string;
  offset?: number;
  limit?: number;
  artistId?: string;
}

export interface CreateAlbumPayload {
  title: string;
  artist_id: string;
  cover_key?: string;
}

export interface UpdateAlbumPayload {
  title?: string;
  artist_id?: string;
  cover_key?: string;
}

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

  async create(payload: CreateAlbumPayload): Promise<AlbumDetail> {
    return await api<AlbumDetail>("/albums", {
      method: "POST",
      body: payload,
    });
  },

  async update(id: string, payload: UpdateAlbumPayload): Promise<AlbumDetail> {
    return await api<AlbumDetail>(`/albums/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async delete(id: string): Promise<void> {
    await api(`/albums/${id}`, { method: "DELETE" });
  },

  /** Importa un álbum completo desde un ZIP (admin): cada .mp3/.aac del ZIP
   *  se sube a R2 y se crea como canción del álbum (mismo cover). */
  async importZip(albumId: string, file: File): Promise<ZipImportResult> {
    const form = new FormData();
    form.append("file", file);
    return await api<ZipImportResult>(`/albums/${albumId}/import-zip`, {
      method: "POST",
      body: form,
      // Un ZIP grande puede tardar varios minutos en subir y procesarse.
      timeout: 300_000,
    });
  },
};
