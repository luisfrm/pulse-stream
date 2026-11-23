/**
 * Integración del historial de reproducciones (espejo de
 * `apps/api/tests/test_listens.py`).
 *
 * Cubre el alta del play (201), la ventana de dedupe de 30 s, el listado
 * `recently-played` (sin duplicar, último play primero, paginado) y el ranking
 * personal `GET /me/top-songs` (solo Worker).
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { ListenRead, RecentlyPlayedSong, SongRead, SongWithPlays } from "@/schemas";
import { createDb } from "@/db/client";
import { listens } from "@/db/schema";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  registerUser,
  resetDb,
  testConfig,
  type TestClient,
} from "./helpers";
import { seedCatalogBatch } from "./catalog-helpers";

/** Admin + N canciones (el dueño de las canciones no es el que escucha). */
async function seedSongs(
  client: TestClient,
  count: number,
): Promise<{ id: string }[]> {
  await registerAndLogin(client, { admin: true });
  const { songIds } = await seedCatalogBatch({
    songs: Array.from({ length: count }, (_, index) => ({
      title: `Canción ${index}`,
    })),
  });
  return songIds.map((id) => ({ id }));
}

/**
 * Inserta N plays directos (sin tocar contadores) con `played_at` arbitrario.
 * `lastPlayedAt` es el más reciente; los anteriores van 1 s atrás cada uno.
 */
async function insertPlays(
  userId: string,
  songId: string,
  count: number,
  lastPlayedAt: Date = new Date(),
): Promise<void> {
  await createDb(testConfig())
    .insert(listens)
    .values(
      Array.from({ length: count }, (_, index) => ({
        id: crypto.randomUUID(),
        userId,
        songId,
        playedAt: new Date(lastPlayedAt.getTime() - index * 1000),
      })),
    );
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
    expect((await anonymous.get("/me/top-songs")).status).toBe(401);
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

  it("dedupe: un listen de hace 31 s del mismo tema SÍ se registra de nuevo", async () => {
    // Primero las canciones (crea un admin), después el usuario que escucha:
    // `seedSongs` registra un usuario nuevo y cambia la sesión del cliente.
    const [song] = await seedSongs(client, 1);
    const user = await registerAndLogin(client);

    // Semilla directa: el play "anterior" ocurrió 31 s atrás (fuera de la
    // ventana de 30 s), así que el próximo POST debe insertar otra fila.
    await createDb(testConfig())
      .insert(listens)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        songId: song!.id,
        playedAt: new Date(Date.now() - 31_000),
      });

    const response = await client.postJson("/me/listens", {
      song_id: song!.id,
    });
    expect(response.status, await response.clone().text()).toBe(201);

    // Dos filas reales -> user_play_count 2 y el contador persistente subió
    // solo por el play nuevo (la fila sembrada no toca contadores).
    const recent = await readJson<{
      items: RecentlyPlayedSong[];
      total: number;
    }>(await client.get("/me/recently-played"));
    expect(recent.total).toBe(1);
    expect(recent.items[0]?.user_play_count).toBe(2);
    expect(
      (await readJson<SongRead>(await client.get(`/songs/${song!.id}`)))
        .play_count,
    ).toBe(1);
  });

  it("historial vacío: Page vacía con offset/limit", async () => {
    await registerAndLogin(client);

    const body = await readJson<{
      items: unknown[];
      total: number;
      offset: number;
      limit: number;
    }>(await client.get("/me/recently-played"));

    expect(body).toEqual({ items: [], total: 0, offset: 0, limit: 50 });
  });

  it("limit fuera de rango -> 422", async () => {
    await registerAndLogin(client);

    for (const query of ["limit=0", "limit=101", "offset=-1"]) {
      expect((await client.get(`/me/recently-played?${query}`)).status).toBe(422);
    }
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

  it("top-songs: ranking por plays del usuario en la ventana", async () => {
    const [s1, s2, s3] = await seedSongs(client, 3);
    const user = await registerAndLogin(client);

    await insertPlays(user.id, s1!.id, 1);
    await insertPlays(user.id, s2!.id, 3);
    await insertPlays(user.id, s3!.id, 2);

    const response = await client.get("/me/top-songs");
    expect(response.status, await response.clone().text()).toBe(200);
    const body = await readJson<SongWithPlays[]>(response);

    expect(body.map((song) => song.id)).toEqual([s2!.id, s3!.id, s1!.id]);
    expect(body.map((song) => song.play_count)).toEqual([3, 2, 1]);
    // Payload completo (artist/album) para pintar cards sin más fetches.
    expect(body[0]?.artist.name).toBeTruthy();
    expect(body[0]?.album).not.toBeNull();
  });

  it("top-songs: desempata por el play más reciente", async () => {
    const [older, newer] = await seedSongs(client, 2);
    const user = await registerAndLogin(client);

    await insertPlays(user.id, older!.id, 2, new Date(Date.now() - 60_000));
    await insertPlays(user.id, newer!.id, 2, new Date(Date.now() - 10_000));

    const body = await readJson<SongWithPlays[]>(await client.get("/me/top-songs"));
    expect(body.map((song) => song.id)).toEqual([newer!.id, older!.id]);
    expect(body.map((song) => song.play_count)).toEqual([2, 2]);
  });

  it("top-songs: respeta el limit", async () => {
    const [s1, s2] = await seedSongs(client, 2);
    const user = await registerAndLogin(client);

    await insertPlays(user.id, s1!.id, 2);
    await insertPlays(user.id, s2!.id, 1);

    const body = await readJson<SongWithPlays[]>(
      await client.get("/me/top-songs?limit=1"),
    );
    expect(body).toHaveLength(1);
  });

  it("top-songs: usuario sin listens -> []", async () => {
    await registerAndLogin(client);

    const response = await client.get("/me/top-songs");
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await readJson(response)).toEqual([]);
  });

  it("top-songs: ignora los plays fuera de la ventana", async () => {
    const [recent, old] = await seedSongs(client, 2);
    const user = await registerAndLogin(client);

    await insertPlays(user.id, recent!.id, 1, new Date(Date.now() - 60_000));
    await insertPlays(
      user.id,
      old!.id,
      1,
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    );

    const inWindow = await readJson<SongWithPlays[]>(
      await client.get("/me/top-songs?days=7"),
    );
    expect(inWindow.map((song) => song.id)).toEqual([recent!.id]);

    // Control: la misma canción vieja sí entra si la ventana la cubre.
    const wider = await readJson<SongWithPlays[]>(
      await client.get("/me/top-songs?days=30"),
    );
    expect(wider.map((song) => song.id)).toContain(old!.id);
  });

  it("top-songs: no mezcla los plays de otros usuarios", async () => {
    const [mine, theirs] = await seedSongs(client, 2);
    const user = await registerAndLogin(client);
    // `registerUser` NO inicia sesión: la cookie del cliente sigue siendo del primero.
    const other = await registerUser(client);

    await insertPlays(user.id, mine!.id, 3);
    await insertPlays(other.id, theirs!.id, 5);

    const body = await readJson<SongWithPlays[]>(await client.get("/me/top-songs"));
    expect(body.map((song) => song.id)).toEqual([mine!.id]);
    expect(body[0]?.play_count).toBe(3);
  });

  it("top-songs: query fuera de rango -> 422", async () => {
    await registerAndLogin(client);

    for (const query of ["days=0", "days=366", "limit=0", "limit=51"]) {
      expect((await client.get(`/me/top-songs?${query}`)).status).toBe(422);
    }
  });
});
