/**
 * Integración de favoritos de playlists/álbumes + `/me/library/ids`
 * (espejo de `apps/api/tests/test_favorites_library.py`).
 *
 * Reglas clave: el like de una playlist nunca muta su contenido, una playlist
 * privada ajena no se puede likear (403) y `/me/library/ids` devuelve los 3
 * sets ordenados.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type {
  AlbumRead,
  MyPlaylistRead,
  PlaylistRead,
  SongRead,
} from "@/schemas";
import {
  createClient,
  describeDb,
  login,
  readJson,
  registerAndLogin,
  resetDb,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";
import { createPlaylist } from "./library-helpers";

const FORBIDDEN = "No tenés acceso a esta playlist";

describeDb("favorites (library)", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("like/unlike de álbumes: listado, ids, song_count y 404", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id, "Disco Uno");
    await createSong(client, {
      title: "Tema Uno",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    await registerAndLogin(client); // usuario normal
    expect(
      (await readJson<{ total: number }>(await client.get("/me/favorites/albums")))
        .total,
    ).toBe(0);

    const liked = await client.request(`/me/favorites/albums/${album.id}`, {
      method: "PUT",
    });
    expect(liked.status, await liked.clone().text()).toBe(204);

    const listed = await readJson<{ items: AlbumRead[]; total: number }>(
      await client.get("/me/favorites/albums"),
    );
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.id).toBe(album.id);
    expect(listed.items[0]?.title).toBe("Disco Uno");
    expect(listed.items[0]?.song_count).toBe(1);
    expect(listed.items[0]?.artist.id).toBe(artist.id);

    const ids = await readJson<string[]>(
      await client.get("/me/favorites/albums/ids"),
    );
    expect(ids).toEqual([album.id]);

    expect(
      (await client.del(`/me/favorites/albums/${album.id}`)).status,
    ).toBe(204);
    expect(
      (await readJson<{ total: number }>(await client.get("/me/favorites/albums")))
        .total,
    ).toBe(0);

    // Unlike de un like inexistente -> 404 con el detail de Álbum.
    const second = await client.del(`/me/favorites/albums/${album.id}`);
    expect(second.status).toBe(404);
    expect(await readJson(second)).toEqual({
      detail: `Álbum ${album.id} no existe`,
    });
  });

  it("favoritear un álbum inexistente -> 404", async () => {
    await registerAndLogin(client);
    const missing = crypto.randomUUID();

    const response = await client.request(`/me/favorites/albums/${missing}`, {
      method: "PUT",
    });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Álbum ${missing} no existe`,
    });
  });

  it("favoritos de álbumes requieren sesión", async () => {
    expect((await client.get("/me/favorites/albums")).status).toBe(401);
    expect(
      (await client.request(`/me/favorites/albums/${crypto.randomUUID()}`, {
        method: "PUT",
      })).status,
    ).toBe(401);
  });

  it("like/unlike de una playlist pública de otro usuario", async () => {
    await registerAndLogin(client);
    const publicOne = await createPlaylist(
      client,
      `Pública de A ${crypto.randomUUID().slice(0, 6)}`,
      { is_public: true },
    );

    await registerAndLogin(client); // usuario B
    expect(
      (await readJson<{ total: number }>(
        await client.get("/me/favorites/playlists"),
      )).total,
    ).toBe(0);

    const liked = await client.request(
      `/me/favorites/playlists/${publicOne.id}`,
      { method: "PUT" },
    );
    expect(liked.status, await liked.clone().text()).toBe(204);

    const listed = await readJson<{ items: PlaylistRead[]; total: number }>(
      await client.get("/me/favorites/playlists"),
    );
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.id).toBe(publicOne.id);
    expect(listed.items[0]?.kind).toBe("user");
    expect(listed.items[0]?.owner_email).toBeTruthy();
    expect(listed.items[0]?.song_count).toBe(0);

    const ids = await readJson<string[]>(
      await client.get("/me/favorites/playlists/ids"),
    );
    expect(ids).toEqual([publicOne.id]);

    expect(
      (await client.del(`/me/favorites/playlists/${publicOne.id}`)).status,
    ).toBe(204);
    expect(
      (await readJson<{ total: number }>(
        await client.get("/me/favorites/playlists"),
      )).total,
    ).toBe(0);

    const again = await client.del(`/me/favorites/playlists/${publicOne.id}`);
    expect(again.status).toBe(404);
    expect(await readJson(again)).toEqual({
      detail: `Playlist ${publicOne.id} no existe`,
    });
  });

  it("no se puede likear la playlist privada de otro (403); la propia sí", async () => {
    await registerAndLogin(client);
    const privateOne = await createPlaylist(client, "Privada de A", {
      is_public: false,
    });

    await registerAndLogin(client); // otro usuario
    const forbidden = await client.request(
      `/me/favorites/playlists/${privateOne.id}`,
      { method: "PUT" },
    );
    expect(forbidden.status).toBe(403);
    expect(await readJson(forbidden)).toEqual({ detail: FORBIDDEN });

    // La propia privada sí se puede marcar como favorita.
    const mine = await createPlaylist(client, "Mi privada", { is_public: false });
    expect(
      (await client.request(`/me/favorites/playlists/${mine.id}`, {
        method: "PUT",
      })).status,
    ).toBe(204);
  });

  it("favoritear una playlist inexistente -> 404", async () => {
    await registerAndLogin(client);
    const missing = crypto.randomUUID();

    const response = await client.request(
      `/me/favorites/playlists/${missing}`,
      { method: "PUT" },
    );

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Playlist ${missing} no existe`,
    });
  });

  it("like a una system: permitido, pero no muta el contenido", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id, "Disco System");
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });
    const system = await readJson<{ id: string; query?: string | null }>(
      await client.postJson("/playlists/system", {
        name: "Novedades",
        query: "new",
      }),
    );
    expect(system.query).toBe("new");

    // Usuario normal: like OK, mutar NO.
    await registerAndLogin(client);
    expect(
      (await client.request(`/me/favorites/playlists/${system.id}`, {
        method: "PUT",
      })).status,
    ).toBe(204);

    expect(
      (await client.postJson(`/playlists/${system.id}/songs`, {
        song_id: song.id,
      })).status,
    ).toBe(403);
    expect(
      (await client.patchJson(`/playlists/${system.id}`, { name: "Hackeada" }))
        .status,
    ).toBe(403);

    // Y aparece en su biblioteca con kind=system.
    const items = await readJson<{ items: PlaylistRead[] }>(
      await client.get("/me/favorites/playlists"),
    );
    const liked = items.items.find((playlist) => playlist.id === system.id);
    expect(liked?.kind).toBe("system");
  });

  it("/me/library/ids devuelve los 3 sets ordenados", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id, "Disco");
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    await registerAndLogin(client); // usuario normal
    expect(await readJson<unknown>(await client.get("/me/library/ids"))).toEqual({
      song_ids: [],
      album_ids: [],
      playlist_ids: [],
    });

    const playlist = await createPlaylist(client, "Mía");
    await client.request(`/me/favorites/${song.id}`, { method: "PUT" });
    await client.request(`/me/favorites/albums/${album.id}`, { method: "PUT" });
    await client.request(`/me/favorites/playlists/${playlist.id}`, {
      method: "PUT",
    });

    const body = await readJson<{
      song_ids: string[];
      album_ids: string[];
      playlist_ids: string[];
    }>(await client.get("/me/library/ids"));

    expect(Object.keys(body).sort()).toEqual([
      "album_ids",
      "playlist_ids",
      "song_ids",
    ]);
    expect(body.song_ids).toEqual([song.id]);
    expect(body.album_ids).toEqual([album.id]);
    expect(body.playlist_ids).toEqual([playlist.id]);

    // Quitar el like de la canción actualiza el set.
    await client.del(`/me/favorites/${song.id}`);
    expect(
      (
        await readJson<{ song_ids: string[] }>(
          await client.get("/me/library/ids"),
        )
      ).song_ids,
    ).toEqual([]);
  });

  it("/me/library/ids requiere sesión", async () => {
    expect((await client.get("/me/library/ids")).status).toBe(401);
  });

  it("GET /me/playlists: solo las del usuario actual", async () => {
    const userA = await registerAndLogin(client);
    const mine = await createPlaylist(client, "Mía");

    await registerAndLogin(client); // B crea una pública
    await createPlaylist(client, "De otro", { is_public: true });

    await login(client, userA.email); // vuelvo a A
    const listed = await readJson<MyPlaylistRead[]>(
      await client.get("/me/playlists"),
    );
    const ids = listed.map((playlist) => playlist.id);
    const names = listed.map((playlist) => playlist.name);

    expect(ids).toContain(mine.id);
    expect(names).not.toContain("De otro");
  });

  it("el favorito de una canción con álbum lista el álbum", async () => {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Artista ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id, "Disco");
    const song = await createSong(client, {
      title: "Tema",
      artistId: artist.id,
      albumId: album.id,
      objectKey: `songs/${crypto.randomUUID()}.mp3`,
    });

    await registerAndLogin(client);
    await client.request(`/me/favorites/${song.id}`, { method: "PUT" });

    const page = await readJson<{ items: SongRead[] }>(
      await client.get("/me/favorites?limit=10"),
    );
    expect(page.items[0]?.album?.id).toBe(album.id);
  });
});
