/**
 * Integración del historial de reproducciones (espejo de
 * `apps/api/tests/test_listens.py`).
 *
 * Cubre el alta del play (201), la ventana de dedupe de 30 s y el listado
 * `recently-played` (sin duplicar, último play primero, paginado).
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { ListenRead, RecentlyPlayedSong, SongRead } from "@/schemas";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";

/** Admin + N canciones (el dueño de las canciones no es el que escucha). */
async function seedSongs(
  client: TestClient,
  count: number,
): Promise<SongRead[]> {
  await registerAndLogin(client, { admin: true });
  const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
  const album = await createAlbum(client, artist.id);

  const songs: SongRead[] = [];
  for (let index = 0; index < count; index += 1) {
    songs.push(
      await createSong(client, {
        title: `Canción ${index}`,
        artistId: artist.id,
        albumId: album.id,
        objectKey: `songs/listens-${crypto.randomUUID()}.mp3`,
      }),
    );
  }
  return songs;
}

describeDb("listens", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("registra un play (201 con id, song_id y played_at)", async () => {
    await registerAndLogin(client);
    const [song] = await seedSongs(client, 1);

    const response = await client.postJson("/me/listens", {
      song_id: song!.id,
    });

    expect(response.status, await response.clone().text()).toBe(201);
    const body = await readJson<ListenRead>(response);
    expect(body.song_id).toBe(song!.id);
    expect(body.id).toBeTruthy();
    expect(body.played_at).toMatch(/Z$/);
  });

  it("requiere sesión", async () => {
    const anonymous = createClient();
    const response = await anonymous.postJson("/me/listens", {
      song_id: crypto.randomUUID(),
    });
    expect(response.status).toBe(401);
    expect((await anonymous.get("/me/recently-played")).status).toBe(401);
  });

  it("canción inexistente -> 404", async () => {
    await registerAndLogin(client);
    const missing = crypto.randomUUID();

    const response = await client.postJson("/me/listens", {
      song_id: missing,
    });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Canción ${missing} no existe`,
    });
  });

  it("dedupe: dos plays del mismo tema en <30 s no duplican la fila", async () => {
    await registerAndLogin(client);
    const [song] = await seedSongs(client, 1);

    const first = await readJson<ListenRead>(
      await client.postJson("/me/listens", { song_id: song!.id }),
    );
    const second = await readJson<ListenRead>(
      await client.postJson("/me/listens", { song_id: song!.id }),
    );

    // El segundo play es sintético: mismo `played_at`, `id` nuevo.
    expect(second.played_at).toBe(first.played_at);
    expect(second.id).not.toBe(first.id);

    const recent = await readJson<{ total: number; items: unknown[] }>(
      await client.get("/me/recently-played"),
    );
    expect(recent.total).toBe(1);
    expect(recent.items).toHaveLength(1);
  });

  it("recently-played: canciones sin duplicar, la última primero", async () => {
    await registerAndLogin(client);
    const [s1, s2, s3] = await seedSongs(client, 3);

    // Orden de reproducción: s1, s2, s1, s3 -> recientes: s3, s1, s2
    for (const song of [s1!, s2!, s1!, s3!]) {
      const response = await client.postJson("/me/listens", {
        song_id: song.id,
      });
      expect(response.status).toBe(201);
    }

    const response = await client.get("/me/recently-played");
    expect(response.status).toBe(200);
    const body = await readJson<{
      items: RecentlyPlayedSong[];
      total: number;
    }>(response);

    expect(body.items.map((song) => song.id)).toEqual([
      s3!.id,
      s1!.id,
      s2!.id,
    ]);
    // Payload completo (artist/album) para pintar cards sin más fetches.
    expect(body.items[0]?.artist.name).toBeTruthy();
    expect(body.items[0]?.album).not.toBeNull();
    expect(body.total).toBe(3);
  });

  it("recently-played pagina con offset/limit y total estable", async () => {
    await registerAndLogin(client);
    const [s1, s2, s3] = await seedSongs(client, 3);

    for (const song of [s1!, s2!, s3!]) {
      await client.postJson("/me/listens", { song_id: song.id });
    }

    const page = await readJson<{
      items: RecentlyPlayedSong[];
      total: number;
      offset: number;
      limit: number;
    }>(await client.get("/me/recently-played?limit=2&offset=0"));

    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(2);
    // Última primero: s3 (posición 0), s2 (posición 1).
    expect(page.items.map((song) => song.id)).toEqual([s3!.id, s2!.id]);

    const second = await readJson<{ items: RecentlyPlayedSong[] }>(
      await client.get("/me/recently-played?limit=2&offset=2"),
    );
    expect(second.items.map((song) => song.id)).toEqual([s1!.id]);
  });

  it("otra canción en el medio corta el dedupe (se registra de nuevo)", async () => {
    await registerAndLogin(client);
    const [s1, s2] = await seedSongs(client, 2);

    for (const song of [s1!, s2!, s1!]) {
      await client.postJson("/me/listens", { song_id: song.id });
    }

    const recent = await readJson<{ items: RecentlyPlayedSong[]; total: number }>(
      await client.get("/me/recently-played"),
    );
    expect(recent.total).toBe(2);
    expect(recent.items.map((song) => song.id)).toEqual([s1!.id, s2!.id]);
    // s1 se tocó dos veces (no consecutivas).
    expect(
      recent.items.find((song) => song.id === s1!.id)?.user_play_count,
    ).toBe(2);
  });

  it("payload del historial inválido -> 422 (song_id no uuid)", async () => {
    await registerAndLogin(client);
    const response = await client.postJson("/me/listens", {
      song_id: "no-es-uuid",
    });
    expect(response.status).toBe(422);
  });
});
