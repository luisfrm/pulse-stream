import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { Page, Playlist, PlaylistDetail } from "./types";

export interface CreatePlaylistPayload {
  name: string;
  description?: string;
  is_public?: boolean;
}

export interface UpdatePlaylistPayload {
  name?: string;
  description?: string;
  is_public?: boolean;
  cover_key?: string;
}

export const playlistsService = {
  async getMyPlaylists(options?: ApiFetchOptions): Promise<Playlist[]> {
    return await api<Playlist[]>("/playlists", options);
  },

  /** Feed público: playlists de toda la comunidad (con autor). */
  async getPublicPlaylists(
    params?: { offset?: number; limit?: number },
    options?: ApiFetchOptions,
  ): Promise<Page<Playlist>> {
    return await api<Page<Playlist>>("/playlists/public", {
      query: params,
      ...options,
    });
  },

  async getPlaylistById(
    id: string,
    options?: ApiFetchOptions
  ): Promise<PlaylistDetail> {
    return await api<PlaylistDetail>(`/playlists/${id}`, options);
  },

  async create(payload: CreatePlaylistPayload): Promise<PlaylistDetail> {
    return await api<PlaylistDetail>("/playlists", {
      method: "POST",
      body: payload,
    });
  },

  async update(
    id: string,
    payload: UpdatePlaylistPayload
  ): Promise<PlaylistDetail> {
    return await api<PlaylistDetail>(`/playlists/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async delete(id: string): Promise<void> {
    await api(`/playlists/${id}`, { method: "DELETE" });
  },

  async addSong(id: string, songId: string): Promise<PlaylistDetail> {
    return await api<PlaylistDetail>(`/playlists/${id}/songs`, {
      method: "POST",
      body: { song_id: songId },
    });
  },

  async removeSong(id: string, songId: string): Promise<PlaylistDetail> {
    return await api<PlaylistDetail>(`/playlists/${id}/songs/${songId}`, {
      method: "DELETE",
    });
  },
};
