/**
 * Integración de las Essentials por artista (playlists editoriales, F3).
 *
 * La semilla es all-time por `songs.play_count` (sin ventana de días), una por
 * artista, con reseed explícito. `refresh` no aplica a esta familia.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { playlists, songs } from "@/db/schema";
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

const ADMIN_REQUIRED = "Requiere permisos de administrador";

async function setPlayCount(songId: string, playCount: number): Promise<void> {
  await createDb(testConfig())
    .update(songs)
    .set({ playCount })
    .where(eq(songs.id, songId));
}

/** Admin + artista + álbum + una canción por cada `playCounts` indicado. */
async function seedArtistWithSongs(
  client: TestClient,
  playCounts: number[],
): Promise<{ artistId: string; artistName: string; songIds: string[] }> {
  await registerAndLogin(client, { admin: true });
  const artist = await createArtist(
    client,
    `Artista ${crypto.randomUUID().slice(0, 6)}`,
  );
  const album = await createAlbum(client, artist.id);

  const songIds: string[] = [];
  for (const [index, playCount] of playCounts.entries()) {
    const song = await createSong(client, {
      title: `Canción ${index}`,
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/essentials-${crypto.randomUUID()}.mp3`,
    });
    await setPlayCount(song.id, playCount);
    songIds.push(song.id);
  }

  return { artistId: artist.id, artistName: artist.name, songIds };
}

function createEssentials(
  client: TestClient,
  body: Record<string, unknown>,
): Promise<Response> {
  return client.postJson("/playlists/system/essentials", body);
}

describeDb("playlists essentials", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("crea Essentials con el ranking all-time del artista y defaults", async () => {
    const { artistId, artistName, songIds } = await seedArtistWithSongs(
      client,
      [1, 3, 2],
    );

    const response = await createEssentials(client, { artist_id: artistId });
    expect(response.status, await response.clone().text()).toBe(201);
    const body = await readJson<PlaylistDetail>(response);

    expect(body.kind).toBe("system");
    expect(body.is_public).toBe(true);
    expect(body.name).toBe(`${artistName} Essentials`);
    expect(body.description).toBe(
      `Lo esencial de ${artistName}, curado por el sistema.`,
    );
    expect(body.song_count).toBe(3);
    expect(body.songs?.map((song) => song.id)).toEqual([
      songIds[1],
      songIds[2],
      songIds[0],
    ]);
    // `artist_top` vive en la DB; el enum OpenAPI compartido no lo expone.
    expect(body.query).toBeNull();

    const [row] = await createDb(testConfig())
      .select()
      .from(playlists)
      .where(eq(playlists.id, body.id));
    expect(row?.query).toBe("artist_top");
    expect(row?.artistId).toBe(artistId);
  });

  it("respeta el limit pedido", async () => {
    const { artistId, songIds } = await seedArtistWithSongs(client, [1, 5, 3]);

    const response = await createEssentials(client, {
      artist_id: artistId,
      limit: 2,
    });
    expect(response.status, await response.clone().text()).toBe(201);
    const body = await readJson<PlaylistDetail>(response);

    expect(body.song_count).toBe(2);
    expect(body.songs?.map((song) => song.id)).toEqual([
      songIds[1],
      songIds[2],
    ]);
  });

  it("artista inexistente y artista sin canciones -> 404", async () => {
    await registerAndLogin(client, { admin: true });

    const missing = crypto.randomUUID();
    const notFound = await createEssentials(client, { artist_id: missing });
    expect(notFound.status).toBe(404);
    expect(await readJson(notFound)).toEqual({
      detail: `Artista ${missing} no existe`,
    });

    // Artista real, sin canciones.
    const emptyArtist = await createArtist(
      client,
      `Artista ${crypto.randomUUID().slice(0, 6)}`,
    );
    const empty = await createEssentials(client, {
      artist_id: emptyArtist.id,
    });
    expect(empty.status).toBe(404);
    expect(await readJson(empty)).toEqual({
      detail: `El artista ${emptyArtist.id} no tiene canciones`,
    });
  });

  it("duplicado 409; sin sesión 401; sin rol admin 403", async () => {
    const { artistId } = await seedArtistWithSongs(client, [1]);

    const first = await createEssentials(client, { artist_id: artistId });
    expect(first.status, await first.clone().text()).toBe(201);

    const duplicate = await createEssentials(client, { artist_id: artistId });
    expect(duplicate.status).toBe(409);
    expect(await readJson(duplicate)).toEqual({
      detail: `El artista ${artistId} ya tiene una playlist Essentials`,
    });

    const anonymous = createClient();
    const unauthorized = await createEssentials(anonymous, {
      artist_id: artistId,
    });
    expect(unauthorized.status).toBe(401);

    await registerAndLogin(client); // usuario normal (sin rol admin)
    const forbidden = await createEssentials(client, { artist_id: artistId });
    expect(forbidden.status).toBe(403);
    expect(await readJson(forbidden)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("reseed reemplaza el ranking y preserva nombre/descripción/likes", async () => {
    const { artistId, songIds } = await seedArtistWithSongs(client, [2, 1]);

    const created = await readJson<PlaylistDetail>(
      await createEssentials(client, {
        artist_id: artistId,
        name: "Mi Essentials",
        description: "Curada a mano",
      }),
    );
    expect(created.songs?.map((song) => song.id)).toEqual([
      songIds[0],
      songIds[1],
    ]);

    await client.request(`/me/favorites/playlists/${created.id}`, {
      method: "PUT",
    });

    // El ranking cambia: la segunda canción pasa a ser la más escuchada.
    await setPlayCount(songIds[1]!, 10);

    const response = await client.post(
      `/playlists/system/${created.id}/reseed`,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const body = await readJson<PlaylistDetail>(response);

    expect(body.id).toBe(created.id);
    expect(body.name).toBe("Mi Essentials");
    expect(body.description).toBe("Curada a mano");
    expect(body.songs?.map((song) => song.id)).toEqual([
      songIds[1],
      songIds[0],
    ]);

    const favorites = await readJson<{ items: PlaylistRead[] }>(
      await client.get("/me/favorites/playlists"),
    );
    expect(favorites.items.some((playlist) => playlist.id === created.id)).toBe(
      true,
    );
  });

  it("reseed de una playlist que no es Essentials -> 400", async () => {
    await registerAndLogin(client, { admin: true });
    const chart = await readJson<PlaylistDetail>(
      await client.postJson("/playlists/system", {
        name: "Chart",
        query: "new",
      }),
    );

    const response = await client.post(
      `/playlists/system/${chart.id}/reseed`,
    );
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail:
        `Playlist ${chart.id} no se puede re-sembrar: ` +
        "solo las Essentials por artista se re-siembran",
    });
  });

  it("refresh sobre una Essentials -> 400 con el motivo", async () => {
    const { artistId } = await seedArtistWithSongs(client, [1]);
    const created = await readJson<PlaylistDetail>(
      await createEssentials(client, { artist_id: artistId }),
    );

    const response = await client.post(
      `/playlists/system/${created.id}/refresh`,
    );
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail:
        `Playlist ${created.id} no se puede regenerar: ` +
        "las Essentials por artista no se refrescan: usá el re-seed explícito",
    });
  });

  it("borrar el artista cascadea la Essentials (204) y desaparece del feed", async () => {
    const { artistId } = await seedArtistWithSongs(client, [1, 2]);
    const created = await readJson<PlaylistDetail>(
      await createEssentials(client, { artist_id: artistId }),
    );

    const feedBefore = await readJson<{ items: PlaylistRead[] }>(
      await client.get("/playlists/public?limit=50"),
    );
    expect(feedBefore.items.some((playlist) => playlist.id === created.id)).toBe(
      true,
    );

    const deleted = await client.del(`/artists/${artistId}`);
    expect(deleted.status, await deleted.clone().text()).toBe(204);

    const feedAfter = await readJson<{ items: PlaylistRead[] }>(
      await client.get("/playlists/public?limit=50"),
    );
    expect(feedAfter.items.some((playlist) => playlist.id === created.id)).toBe(
      false,
    );

    const lookup = await readJson<PlaylistRead | null>(
      await client.get(`/playlists/system/essentials?artist_id=${artistId}`),
    );
    expect(lookup).toBeNull();
  });

  it("reseed con ranking vacío -> 404 y no destruye la curación", async () => {
    const { artistId, songIds } = await seedArtistWithSongs(client, [2]);
    const created = await readJson<PlaylistDetail>(
      await createEssentials(client, { artist_id: artistId }),
    );

    // Curación manual: una canción de otro artista.
    const otherArtist = await createArtist(
      client,
      `Artista ${crypto.randomUUID().slice(0, 6)}`,
    );
    const otherAlbum = await createAlbum(client, otherArtist.id);
    const otherSong = await createSong(client, {
      title: "Invitada",
      artistId: otherArtist.id,
      albumId: otherAlbum.id,
      objectKey: `songs/essentials-other-${crypto.randomUUID()}.mp3`,
    });
    await client.postJson(`/playlists/${created.id}/songs`, {
      song_id: otherSong.id,
    });

    // El artista se queda sin canciones: el ranking queda vacío.
    for (const songId of songIds) {
      expect((await client.del(`/songs/${songId}`)).status).toBe(204);
    }

    const response = await client.post(
      `/playlists/system/${created.id}/reseed`,
    );
    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `El artista ${artistId} no tiene canciones`,
    });

    // La canción invitada sigue ahí: no se vació la playlist.
    const detail = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${created.id}`),
    );
    expect(detail.songs?.map((song) => song.id)).toEqual([otherSong.id]);
  });

  it("lookup sin sesión -> 401", async () => {
    const anonymous = createClient();
    const response = await anonymous.get(
      `/playlists/system/essentials?artist_id=${crypto.randomUUID()}`,
    );
    expect(response.status).toBe(401);
  });

  it("reseed sin rol admin -> 403", async () => {
    const { artistId } = await seedArtistWithSongs(client, [1]);
    const created = await readJson<PlaylistDetail>(
      await createEssentials(client, { artist_id: artistId }),
    );

    await registerAndLogin(client); // usuario normal
    const response = await client.post(
      `/playlists/system/${created.id}/reseed`,
    );
    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("reseed de una playlist inexistente -> 404", async () => {
    await registerAndLogin(client, { admin: true });
    const missing = crypto.randomUUID();

    const response = await client.post(`/playlists/system/${missing}/reseed`);
    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Playlist ${missing} no existe`,
    });
  });

  it("lookup por artista: devuelve la playlist o null", async () => {
    const { artistId, songIds } = await seedArtistWithSongs(client, [1, 2]);

    const before = await readJson<PlaylistRead | null>(
      await client.get(`/playlists/system/essentials?artist_id=${artistId}`),
    );
    expect(before).toBeNull();

    const created = await readJson<PlaylistDetail>(
      await createEssentials(client, { artist_id: artistId }),
    );

    const after = await readJson<PlaylistRead | null>(
      await client.get(`/playlists/system/essentials?artist_id=${artistId}`),
    );
    expect(after?.id).toBe(created.id);
    expect(after?.song_count).toBe(songIds.length);

    // Sin artist_id el query es inválido.
    expect((await client.get("/playlists/system/essentials")).status).toBe(422);
  });
});
