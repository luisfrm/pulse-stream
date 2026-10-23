/**
 * Integración de las playlists del sistema (espejo de
 * `apps/api/tests/test_playlists_system.py`).
 *
 * Los snapsions se generan con `top_week`/`top_month`/`new`, se pueden
 * regenerar sin duplicar y solo los muta un admin. Los "plays" se insertan
 * directo en `listens` porque `POST /me/listens` es de F7.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { playlists } from "@/db/schema";
import type { PlaylistDetail, PlaylistRead } from "@/schemas";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  testConfig,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";
import { createPlaylist, insertListens } from "./library-helpers";

const FORBIDDEN = "No tenés acceso a esta playlist";
const ADMIN_REQUIRED = "Requiere permisos de administrador";

describeDb("playlists system", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("crear una playlist system requiere admin", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/playlists/system", {
      name: "Top",
      query: "top_week",
    });

    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("crea el snapshot top_week (pública, kind=system, ordenada por plays)", async () => {
    const admin = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const s1 = await createSong(client, {
      title: "Uno",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}-1.mp3`,
    });
    const s2 = await createSong(client, {
      title: "Dos",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}-2.mp3`,
    });

    // s1 se toca dos veces, s2 una -> top_week = [s1, s2]
    await insertListens(admin.id, [s1.id, s2.id, s1.id]);

    const response = await client.postJson("/playlists/system", {
      name: "Top de la semana",
      description: "Lo más sonado",
      query: "top_week",
    });

    expect(response.status, await response.clone().text()).toBe(201);
    const body = await readJson<PlaylistDetail>(response);
    expect(body.kind).toBe("system");
    expect(body.is_public).toBe(true);
    expect(body.query).toBe("top_week");
    expect(body.description).toBe("Lo más sonado");
    expect(body.song_count).toBe(2);

    const ids = (body.songs ?? []).map((song) => song.id);
    expect(ids).toEqual([s1.id, s2.id]);
  });

  it("crea el snapshot new (canciones recién agregadas)", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const older = await createSong(client, {
      title: "Vieja",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}-old.mp3`,
    });
    const newer = await createSong(client, {
      title: "Nueva",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}-new.mp3`,
    });

    const response = await client.postJson("/playlists/system", {
      name: "Recién agregadas",
      query: "new",
    });

    expect(response.status).toBe(201);
    const body = await readJson<PlaylistDetail>(response);
    expect(body.kind).toBe("system");
    expect(body.query).toBe("new");
    expect(body.songs?.map((song) => song.id)).toEqual([newer.id, older.id]);
  });

  it("las system van primero en el feed público", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    const system = await client.postJson("/playlists/system", {
      name: "Feed system",
      query: "new",
    });
    expect(system.status).toBe(201);

    // Una playlist de usuario pública creada DESPUÉS (igual va segunda).
    await registerAndLogin(client);
    await createPlaylist(client, "Feed user", { is_public: true });

    const feed = await readJson<{ items: PlaylistRead[] }>(
      await client.get("/playlists/public"),
    );
    expect(feed.items[0]?.kind).toBe("system");
    expect(feed.items[0]?.name).toBe("Feed system");
  });

  it("un usuario normal no puede mutar una playlist system (pero sí verla)", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    const created = await readJson<PlaylistDetail>(
      await client.postJson("/playlists/system", {
        name: "Protegida",
        query: "new",
      }),
    );

    await registerAndLogin(client); // otro usuario
    const patched = await client.patchJson(`/playlists/${created.id}`, {
      name: "Hackeada",
    });
    expect(patched.status).toBe(403);
    expect(await readJson(patched)).toEqual({ detail: FORBIDDEN });
    expect((await client.del(`/playlists/${created.id}`)).status).toBe(403);
    expect(
      (await client.postJson(`/playlists/${created.id}/songs`, {
        song_id: song.id,
      })).status,
    ).toBe(403);

    // Pero sí puede verla (es pública).
    expect((await client.get(`/playlists/${created.id}`)).status).toBe(200);
  });

  it("top_month: más reproducidas del mes calendario, por count desc", async () => {
    const admin = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const s1 = await createSong(client, {
      title: "Mes 1",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}-m1.mp3`,
    });
    const s2 = await createSong(client, {
      title: "Mes 2",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}-m2.mp3`,
    });

    await insertListens(admin.id, [s1.id, s2.id, s1.id, s2.id, s1.id]);

    const response = await client.postJson("/playlists/system", {
      name: "Top del mes",
      query: "top_month",
    });

    expect(response.status, await response.clone().text()).toBe(201);
    const body = await readJson<PlaylistDetail>(response);
    expect(body.query).toBe("top_month");
    const ids = (body.songs ?? []).map((song) => song.id);
    expect(ids).toEqual([s1.id, s2.id]);
  });

  it("refresh reemplaza las canciones en la MISMA playlist (sin duplicar)", async () => {
    const admin = await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const [s1, s2, s3] = [
      await createSong(client, {
        title: "Uno",
        artistId: artist.id,
        albumId: album.id,
        objectKey: `songs/${crypto.randomUUID()}-r1.mp3`,
      }),
      await createSong(client, {
        title: "Dos",
        artistId: artist.id,
        albumId: album.id,
        objectKey: `songs/${crypto.randomUUID()}-r2.mp3`,
      }),
      await createSong(client, {
        title: "Tres",
        artistId: artist.id,
        albumId: album.id,
        objectKey: `songs/${crypto.randomUUID()}-r3.mp3`,
      }),
    ];

    // s1 con 2 plays y s2 con 1: el orden no depende del desempate por `id`
    // (los UUID son aleatorios). s3 no tiene plays -> no entra al snapshot.
    await insertListens(admin.id, [s1!.id, s1!.id, s2!.id]);

    const created = await readJson<PlaylistDetail>(
      await client.postJson("/playlists/system", {
        name: "Top semanal",
        query: "top_week",
      }),
    );
    const idsBefore = (created.songs ?? []).map((song) => song.id);
    expect(idsBefore).toEqual([s1!.id, s2!.id]);
    expect(idsBefore).not.toContain(s3!.id);

    // s3 pasa a ser la más escuchada: totales s3=5 > s1=4 > s2=2 (sin empates,
    // porque el desempate por `song_id` es aleatorio).
    await insertListens(admin.id, [
      s3!.id,
      s1!.id,
      s3!.id,
      s2!.id,
      s3!.id,
      s1!.id,
      s3!.id,
      s2!.id,
      s3!.id,
    ]);

    const refreshed = await client.post(`/playlists/system/${created.id}/refresh`);
    expect(refreshed.status, await refreshed.clone().text()).toBe(200);
    const body = await readJson<PlaylistDetail>(refreshed);

    expect(body.id).toBe(created.id); // misma playlist, no se duplica
    expect(body.kind).toBe("system");
    expect(body.query).toBe("top_week");

    const idsAfter = (body.songs ?? []).map((song) => song.id);
    expect(body.song_count).toBe(idsAfter.length);
    expect(new Set(idsAfter).size).toBe(idsAfter.length); // sin duplicados
    expect(idsAfter).toEqual([s3!.id, s1!.id, s2!.id]);
  });

  it("refresh requiere admin", async () => {
    await registerAndLogin(client, { admin: true });
    const created = await readJson<PlaylistDetail>(
      await client.postJson("/playlists/system", {
        name: "Top",
        query: "new",
      }),
    );

    await registerAndLogin(client); // usuario normal
    const response = await client.post(`/playlists/system/${created.id}/refresh`);

    expect(response.status).toBe(403);
  });

  it("otro admin no puede mutar la system de su dueño (gana el dueño)", async () => {
    // Admin A crea la playlist system (queda como owner).
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });
    const created = await readJson<PlaylistDetail>(
      await client.postJson("/playlists/system", {
        name: "Dueña A",
        query: "new",
      }),
    );

    // Admin B (otro usuario, también admin): `_get_mutable` exige ser el dueño.
    await registerAndLogin(client, { admin: true });

    for (const response of [
      await client.patchJson(`/playlists/${created.id}`, { name: "Hackeada" }),
      await client.del(`/playlists/${created.id}`),
      await client.postJson(`/playlists/${created.id}/songs`, {
        song_id: song.id,
      }),
      await client.post(`/playlists/system/${created.id}/refresh`),
    ]) {
      expect(response.status).toBe(403);
      expect(await readJson(response)).toEqual({ detail: FORBIDDEN });
    }

    // La playlist quedó intacta y sigue siendo visible (es pública).
    const detail = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${created.id}`),
    );
    expect(detail.name).toBe("Dueña A");
    expect(detail.songs?.map((entry) => entry.id)).toEqual([song.id]);
  });

  it("refresh de una playlist de usuario -> 400 con el motivo", async () => {
    await registerAndLogin(client, { admin: true });

    const userPlaylist = await createPlaylist(client, "Personal");
    const response = await client.post(
      `/playlists/system/${userPlaylist.id}/refresh`,
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail:
        `Playlist ${userPlaylist.id} no se puede regenerar: ` +
        "solo las playlists del sistema se regeneran",
    });
  });

  it("refresh de una system sin query -> 400 con el mensaje de la migración", async () => {
    const admin = await registerAndLogin(client, { admin: true });
    const playlistId = crypto.randomUUID();
    await createDb(testConfig()).insert(playlists).values({
      id: playlistId,
      name: "Sin query",
      kind: "system",
      isPublic: true,
      ownerId: admin.id,
      query: null,
    });

    const response = await client.post(`/playlists/system/${playlistId}/refresh`);

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail:
        `Playlist ${playlistId} no se puede regenerar: ` +
        "esta playlist no tiene query de snapshot asociada " +
        "(fue creada antes de la migración 0008); recreala para poder refrescarla",
    });
  });

  it("refresh con query inválida -> 400 con el repr de Python", async () => {
    const admin = await registerAndLogin(client, { admin: true });
    const playlistId = crypto.randomUUID();
    await createDb(testConfig()).insert(playlists).values({
      id: playlistId,
      name: "Query rota",
      kind: "system",
      isPublic: true,
      ownerId: admin.id,
      query: "bogus",
    });

    const response = await client.post(`/playlists/system/${playlistId}/refresh`);

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail:
        `Playlist ${playlistId} no se puede regenerar: ` +
        "query de snapshot inválida ('bogus')",
    });
  });

  it("refresh de una playlist inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const missing = crypto.randomUUID();

    const response = await client.post(`/playlists/system/${missing}/refresh`);

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Playlist ${missing} no existe`,
    });
  });
});
