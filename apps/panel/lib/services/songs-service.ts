import { panelApi, type ApiFetchOptions } from "@/lib/api/client";
import type { Page, Song } from "./types";

export interface GetSongsParams {
  query?: string;
  offset?: number;
  limit?: number;
  artistId?: string;
  /** Canciones donde el artista es colaborador (no principal). */
  collaboratorId?: string;
  albumId?: string;
  playlistId?: string;
}

export interface CreateSongPayload {
  title: string;
  artist_id?: string;
  artist_name?: string;
  /**
   * Obligatorio: la canción hereda el cover del álbum. Crear sin `album_id`
   * es 422 en la API (campo requerido de `SongCreate`).
   */
  album_id: string;
  genres: string[];
  lyrics?: string;
  object_key: string;
  collaborator_ids?: string[];
}

export interface UpdateSongPayload {
  title?: string;
  artist_id?: string;
  /**
   * Reasignar a otro álbum. Quitarlo está prohibido: `PATCH {album_id: null}`
   * responde 400 (`AlbumRequiredError`); crear sin `album_id` es 422.
   */
  album_id?: string;
  genres?: string[];
  lyrics?: string;
  duration_seconds?: number;
  collaborator_ids?: string[];
}

/** Servicio admin de canciones (crear/editar/borrar + lecturas del panel). */
export const songsService = {
  async getSongs(
    params?: GetSongsParams,
    options?: ApiFetchOptions,
  ): Promise<Page<Song>> {
    const { artistId, collaboratorId, albumId, playlistId, query, ...rest } =
      params ?? {};
    return await panelApi<Page<Song>>("/songs", {
      query: {
        ...rest,
        // La API espera `q` para la búsqueda por título (snake_case para ids).
        ...(query ? { q: query } : {}),
        ...(artistId ? { artist_id: artistId } : {}),
        ...(collaboratorId ? { collaborator_id: collaboratorId } : {}),
        ...(albumId ? { album_id: albumId } : {}),
        ...(playlistId ? { playlist_id: playlistId } : {}),
      },
      ...options,
    });
  },

  async getSongById(id: string, options?: ApiFetchOptions): Promise<Song> {
    return await panelApi<Song>(`/songs/${id}`, options);
  },

  async createSong(payload: CreateSongPayload): Promise<Song> {
    return await panelApi<Song>("/songs", {
      method: "POST",
      body: payload,
    });
  },

  async updateSong(id: string, payload: UpdateSongPayload): Promise<Song> {
    return await panelApi<Song>(`/songs/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteSong(id: string): Promise<void> {
    await panelApi(`/songs/${id}`, { method: "DELETE" });
  },
};
