/**
 * Integración de los contadores de reproducciones (espejo de
 * `apps/api/tests/test_plays.py`).
 *
 * Cada play real (no deduplicado) suma +1 a `songs.play_count` y a
 * `users.total_plays`; el historial expone `user_play_count` y
 * `/songs/popular` refleja los plays registrados por HTTP.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  RecentlyPlayedSong,
  SongRead,
  SongWithPlays,
  UserRead,
} from "@/schemas";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";

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
        objectKey: `songs/plays-${crypto.randomUUID()}.mp3`,
      }),
    );
  }
  return songs;
}

async function play(client: TestClient, songId: string): Promise<void> {
  const response = await client.postJson("/me/listens", { song_id: songId });
  expect(response.status, await response.clone().text()).toBe(201);
}

describeDb("plays", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("cada play suma +1 a songs.play_count (el dedupe no suma doble)", async () => {
    await registerAndLogin(client);
    const [song] = await seedSongs(client, 1);

    expect(
      (await readJson<SongRead>(await client.get(`/songs/${song!.id}`)))
        .play_count,
    ).toBe(0);

    // Dos plays consecutivos de la misma canción en <30 s -> 1 play real.
    await play(client, song!.id);
    await play(client, song!.id);
    expect(
      (await readJson<SongRead>(await client.get(`/songs/${song!.id}`)))
        .play_count,
    ).toBe(1);

    // Otra canción y volver: ya no es consecutivo -> suma de nuevo.
    const [other] = await seedSongs(client, 1);
    await play(client, other!.id);
    await play(client, song!.id);
    expect(
      (await readJson<SongRead>(await client.get(`/songs/${song!.id}`)))
        .play_count,
    ).toBe(2);
  });

  it("cada play suma +1 a users.total_plays", async () => {
    await registerAndLogin(client);
    const [s1, s2] = await seedSongs(client, 2);

    expect(
      (await readJson<UserRead>(await client.get("/users/me"))).total_plays,
    ).toBe(0);

    await play(client, s1!.id);
    await play(client, s2!.id);

    expect(
      (await readJson<UserRead>(await client.get("/users/me"))).total_plays,
    ).toBe(2);

    // Repetir el mismo play dentro de la ventana NO suma.
    await play(client, s2!.id);
    expect(
      (await readJson<UserRead>(await client.get("/users/me"))).total_plays,
    ).toBe(2);
  });

  it("recently-played incluye user_play_count por canción", async () => {
    await registerAndLogin(client);
    const [s1, s2, s3] = await seedSongs(client, 3);

    // s1 dos veces (no consecutivas), s2 una, s3 una.
    for (const song of [s1!, s2!, s1!, s3!]) {
      await play(client, song.id);
    }

    const body = await readJson<{ items: RecentlyPlayedSong[] }>(
      await client.get("/me/recently-played"),
    );
    const byId = new Map(body.items.map((song) => [song.id, song]));

    expect(byId.get(s1!.id)?.user_play_count).toBe(2);
    expect(byId.get(s2!.id)?.user_play_count).toBe(1);
    expect(byId.get(s3!.id)?.user_play_count).toBe(1);
  });

  it("/songs/popular: ranking por plays reales registrados por HTTP", async () => {
    await registerAndLogin(client);
    const [s1, s2] = await seedSongs(client, 2);

    // s1 se toca 3 veces no consecutivas, s2 dos.
    for (const song of [s1!, s2!, s1!, s2!, s1!]) {
      await play(client, song.id);
    }

    const items = await readJson<SongWithPlays[]>(
      await client.get("/songs/popular"),
    );

    expect(items.map((song) => song.id)).toEqual([s1!.id, s2!.id]);
    expect(items[0]?.play_count).toBe(3);
    expect(items[1]?.play_count).toBe(2);
  });

  it("/songs/popular respeta limit y days", async () => {
    await registerAndLogin(client);
    const [s1, s2, s3] = await seedSongs(client, 3);
    for (const song of [s1!, s2!, s3!]) {
      await play(client, song.id);
    }

    expect(
      (await readJson<SongWithPlays[]>(await client.get("/songs/popular?limit=2")))
        .length,
    ).toBe(2);

    // Ventana de 1 día incluye los plays de recién (misma corrida).
    expect(
      (await readJson<SongWithPlays[]>(await client.get("/songs/popular?days=1")))
        .length,
    ).toBe(3);
  });

  it("/songs/popular: month=true usa el mes calendario actual", async () => {
    await registerAndLogin(client);
    const [s1, s2, s3] = await seedSongs(client, 3);
    for (const song of [s1!, s2!, s3!]) {
      await play(client, song.id);
    }

    const items = await readJson<SongWithPlays[]>(
      await client.get("/songs/popular?month=true"),
    );
    const ranking = new Set(items.map((song) => song.id));
    expect(ranking.has(s1!.id)).toBe(true);
    expect(ranking.has(s2!.id)).toBe(true);
    expect(ranking.has(s3!.id)).toBe(true);
  });
});
