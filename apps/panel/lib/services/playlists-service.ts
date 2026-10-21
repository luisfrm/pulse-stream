import { panelApi, type ApiFetchOptions } from "@/lib/api/client";
import type { Page, Playlist, PlaylistDetail } from "./types";

export interface CreateSystemPlaylistPayload {
  name: string;
  description?: string;
  query: "top_week" | "top_month" | "new";
}

/** Playlists del sistema (snapshots) — solo admin. */
export const playlistsService = {
  /** Feed público: las system se ordenan primero. */
  async getPublicPlaylists(
    params?: { offset?: number; limit?: number },
    options?: ApiFetchOptions,
  ): Promise<Page<Playlist>> {
    return await panelApi<Page<Playlist>>("/playlists/public", {
      query: params,
      ...options,
    });
  },

  /** Genera una playlist del sistema (snapshot de una query) — admin only. */
  async createSystem(payload: CreateSystemPlaylistPayload): Promise<PlaylistDetail> {
    return await panelApi<PlaylistDetail>("/playlists/system", {
      method: "POST",
      body: payload,
    });
  },

  /** Regenera el snapshot (sin duplicar canciones) — admin only. */
  async refreshSystem(id: string): Promise<PlaylistDetail> {
    return await panelApi<PlaylistDetail>(`/playlists/system/${id}/refresh`, {
      method: "POST",
    });
  },

  async delete(id: string): Promise<void> {
    await panelApi(`/playlists/${id}`, { method: "DELETE" });
  },
};
