/**
 * Helpers de catálogo para los tests de F4 (equivalen a `_create_artist`,
 * `_create_album` y `_create_song` de `apps/api/tests/test_{albums,songs}.py`).
 *
 * Igual que en Python, un alta que no devuelve el status esperado es un fallo
 * del test (no se sigue con un body inválido).
 */

import type { AlbumDetail, ArtistRead, SongRead } from "@/schemas";

import type { TestClient } from "./helpers";

export async function createArtist(
  client: TestClient,
  name: string,
): Promise<ArtistRead> {
  const response = await client.postJson("/artists", { name });
  if (response.status !== 201) {
    throw new Error(
      `POST /artists falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as ArtistRead;
}

export async function createAlbum(
  client: TestClient,
  artistId: string,
  title = "Álbum",
): Promise<AlbumDetail> {
  const response = await client.postJson("/albums", {
    title,
    artist_id: artistId,
  });
  if (response.status !== 201) {
    throw new Error(
      `POST /albums falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as AlbumDetail;
}

export interface CreateSongOptions {
  title: string;
  albumId: string;
  objectKey: string;
  /** Obligatorio uno de los dos: `artistId` (existente) o `artistName`. */
  artistId?: string;
  artistName?: string;
  genres?: string[];
  lyrics?: string;
  durationSeconds?: number;
  collaboratorIds?: string[];
}

export async function createSong(
  client: TestClient,
  options: CreateSongOptions,
): Promise<SongRead> {
  const payload: Record<string, unknown> = {
    title: options.title,
    album_id: options.albumId,
    object_key: options.objectKey,
  };
  if (options.artistId !== undefined) payload.artist_id = options.artistId;
  if (options.artistName !== undefined) payload.artist_name = options.artistName;
  if (options.genres !== undefined) payload.genres = options.genres;
  if (options.lyrics !== undefined) payload.lyrics = options.lyrics;
  if (options.durationSeconds !== undefined) {
    payload.duration_seconds = options.durationSeconds;
  }
  if (options.collaboratorIds !== undefined) {
    payload.collaborator_ids = options.collaboratorIds;
  }

  const response = await client.postJson("/songs", payload);
  if (response.status !== 201) {
    throw new Error(
      `POST /songs falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as SongRead;
}
