/**
 * Helpers de playlists/biblioteca para los tests de F6 (equivalen a los
 * `_create_playlist` / `_add_song` de `apps/api/tests/test_playlists*.py`).
 *
 * `insertListen` escribe en `listens` directo aunque `POST /me/listens` (F7) ya
 * exista: los snapshots necesitan conteos EXACTOS por canción (p.ej. 5/4/2) sin
 * pelear con el dedupe de 30 s, que obligaría a intercalar canciones. El camino
 * HTTP está cubierto en `tests/listens.test.ts` y `tests/plays.test.ts`.
 */

import { createDb } from "@/db/client";
import { listens } from "@/db/schema";
import type { PlaylistDetail } from "@/schemas";

import { testConfig, type TestClient } from "./helpers";

/** `POST /playlists` (201 esperado). */
export async function createPlaylist(
  client: TestClient,
  name = "Mi playlist",
  extra: Record<string, unknown> = {},
): Promise<PlaylistDetail> {
  const response = await client.postJson("/playlists", { name, ...extra });
  if (response.status !== 201) {
    throw new Error(
      `POST /playlists falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as PlaylistDetail;
}

/** `POST /playlists/{id}/songs` (200 esperado). */
export async function addSongToPlaylist(
  client: TestClient,
  playlistId: string,
  songId: string,
): Promise<PlaylistDetail> {
  const response = await client.postJson(`/playlists/${playlistId}/songs`, {
    song_id: songId,
  });
  if (response.status !== 200) {
    throw new Error(
      `POST /playlists/{id}/songs falló (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as PlaylistDetail;
}

/** Fila de `listens` directa (el endpoint de F7 todavía no existe). */
export async function insertListen(
  userId: string,
  songId: string,
  playedAt?: Date,
): Promise<void> {
  await createDb(testConfig())
    .insert(listens)
    .values({
      id: crypto.randomUUID(),
      userId,
      songId,
      ...(playedAt ? { playedAt } : {}),
    });
}

/** Inserta un play por canción en UNA sola sentencia multi-fila. */
export async function insertListens(
  userId: string,
  songIds: readonly string[],
): Promise<void> {
  if (songIds.length === 0) return;

  await createDb(testConfig())
    .insert(listens)
    .values(
      songIds.map((songId) => ({
        id: crypto.randomUUID(),
        userId,
        songId,
      })),
    );
}
