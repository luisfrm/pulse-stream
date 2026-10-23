/**
 * Integración de `/me/playlists` y `/me/playlists/page` (espejo de
 * `apps/api/tests/test_playlists_me.py` + la variante paginada).
 *
 * El PlaylistPicker necesita saber si una canción ya pertenece a cada playlist:
 * `MyPlaylistRead` expone `song_ids` ordenados por posición — schema exclusivo
 * de /me/playlists (no contamina `PlaylistRead` ni el detalle).
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { MyPlaylistRead, PlaylistDetail } from "@/schemas";
import { createDb } from "@/db/client";
import { playlists } from "@/db/schema";
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
import { addSongToPlaylist, createPlaylist } from "./library-helpers";

describeDb("me/playlists", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("expone song_ids en orden de posición", async () => {
    await registerAndLogin(client, { admin: true });
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

    await registerAndLogin(client);
    const playA = await createPlaylist(client, "Playlist A");
    const playB = await createPlaylist(client, "Playlist B");
    const empty = await createPlaylist(client, "Vacía");

    await addSongToPlaylist(client, playA.id, s1.id); // A: [s1]
    await addSongToPlaylist(client, playB.id, s2.id); // B: [s2]
    await addSongToPlaylist(client, playB.id, s1.id); // B: [s2, s1]

    const response = await client.get("/me/playlists");
    expect(response.status).toBe(200);
    const byId = new Map(
      (await readJson<MyPlaylistRead[]>(response)).map((playlist) => [
        playlist.id,
        playlist,
      ]),
    );

    expect(byId.get(playA.id)?.song_ids).toEqual([s1.id]);
    expect(byId.get(playB.id)?.song_ids).toEqual([s2.id, s1.id]);
    expect(byId.get(empty.id)?.song_ids).toEqual([]);
    // El resto del contrato de PlaylistRead se mantiene intacto.
    expect(byId.get(playB.id)?.song_count).toBe(2);
    expect(byId.get(playB.id)?.owner_email).toBeTruthy();
    expect(byId.get(playB.id) && "songs" in byId.get(playB.id)!).toBe(false);
  });

  it("el schema con song_ids no se filtra a /playlists ni al detalle", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    await registerAndLogin(client);
    const playlist = await createPlaylist(client, "Para no filtrar");
    await addSongToPlaylist(client, playlist.id, song.id);

    const listed = await readJson<Array<Record<string, unknown>>>(
      await client.get("/playlists"),
    );
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((item) => !("song_ids" in item))).toBe(true);

    const detail = await readJson<Record<string, unknown>>(
      await client.get(`/playlists/${playlist.id}`),
    );
    expect("song_ids" in detail).toBe(false);
  });

  it("requiere sesión", async () => {
    expect((await client.get("/me/playlists")).status).toBe(401);
    expect((await client.get("/me/playlists/page")).status).toBe(401);
  });

  it("la versión paginada devuelve Page<MyPlaylistRead> con song_ids", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    await registerAndLogin(client);
    for (const name of ["P1", "P2", "P3"]) {
      await createPlaylist(client, name);
    }
    const first = await readJson<MyPlaylistRead[]>(
      await client.get("/me/playlists"),
    );
    // P2 queda en la página (offset 1 saltea la más nueva, P3).
    const target = first[1]!;
    await addSongToPlaylist(client, target.id, song.id);

    const page = await readJson<{
      items: MyPlaylistRead[];
      total: number;
      offset: number;
      limit: number;
    }>(await client.get("/me/playlists/page?limit=2&offset=1"));

    expect(page.total).toBe(3);
    expect(page.offset).toBe(1);
    expect(page.limit).toBe(2);
    expect(page.items).toHaveLength(2);
    // Más nuevas primero: offset 1 saltea la última creada (P3).
    expect(page.items.map((playlist) => playlist.name)).toEqual(["P2", "P1"]);
    expect(page.items.every((playlist) => "song_ids" in playlist)).toBe(true);

    // El `song_ids` sigue viajando en la página.
    expect(page.items.map((playlist) => playlist.song_ids)).toContainEqual([
      song.id,
    ]);

    // Default de limit = 20 y límites del contrato (1..100).
    const defaults = await client.get("/me/playlists/page");
    expect((await readJson<{ limit: number }>(defaults)).limit).toBe(20);
    expect((await client.get("/me/playlists/page?limit=0")).status).toBe(422);
    expect((await client.get("/me/playlists/page?limit=101")).status).toBe(422);
  });

  it("el detalle de una playlist propia trae las canciones por posición", async () => {
    await registerAndLogin(client);
    const playlist = await createPlaylist(client, "Sola");
    const detail = await readJson<PlaylistDetail>(
      await client.get(`/playlists/${playlist.id}`),
    );

    expect(detail.id).toBe(playlist.id);
    expect(detail.songs).toEqual([]);
    expect(detail.song_count).toBe(0);
  });

  it("/me/playlists está acotado a 200 y /me/playlists/page no", async () => {
    const user = await registerAndLogin(client);

    // 205 playlists en UNA sentencia (crear 205 por API sería lentísimo).
    const rows = Array.from({ length: 205 }, () => ({
      id: crypto.randomUUID(),
      name: `Bulk ${crypto.randomUUID().slice(0, 8)}`,
      isPublic: false,
      ownerId: user.id,
    }));
    await createDb(testConfig()).insert(playlists).values(rows);

    const unpaginated = await readJson<MyPlaylistRead[]>(
      await client.get("/me/playlists"),
    );
    expect(unpaginated).toHaveLength(200);

    // La versión paginada no aplica el tope: offset 199 trae las 6 restantes.
    const tail = await readJson<{
      items: MyPlaylistRead[];
      total: number;
    }>(await client.get("/me/playlists/page?offset=199&limit=100"));
    expect(tail.total).toBe(205);
    expect(tail.items).toHaveLength(6);

    const head = await readJson<{ items: MyPlaylistRead[] }>(
      await client.get("/me/playlists/page?limit=100"),
    );
    expect(head.items).toHaveLength(100);
  });
});
