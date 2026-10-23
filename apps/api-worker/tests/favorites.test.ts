/**
 * Integración de `/me/favorites` (espejo de `apps/api/tests/test_favorites.py`).
 *
 * Canciones favoritas: alta/baja idempotentes, listado ordenado por fecha del
 * like, ids ordenados y 404 con el detail de Canción.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { SongRead } from "@/schemas";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  type TestClient,
} from "./helpers";
import { createAlbum, createArtist, createSong } from "./catalog-helpers";

describeDb("favorites (songs)", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  /** 3 canciones creadas por un admin (el usuario normal solo las likea). */
  async function seedSongs(): Promise<SongRead[]> {
    await registerAndLogin(client, { admin: true });
    const artist = await createArtist(client, `Test Band ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum(client, artist.id);
    const songs: SongRead[] = [];
    for (const title of [
      "De Música Ligera",
      "Nada Personal",
      "Persiana Americana",
    ]) {
      songs.push(
        await createSong(client, {
          title,
          artistId: artist.id,
          albumId: album.id,
          objectKey: `songs/${crypto.randomUUID()}.mp3`,
        }),
      );
    }
    return songs;
  }

  it("agrega, lista y quita favoritos", async () => {
    const songs = await seedSongs();
    await registerAndLogin(client); // usuario normal

    const empty = await readJson<{ total: number }>(
      await client.get("/me/favorites"),
    );
    expect(empty.total).toBe(0);

    for (const song of songs.slice(0, 2)) {
      const response = await client.request(`/me/favorites/${song.id}`, {
        method: "PUT",
      });
      expect(response.status, await response.clone().text()).toBe(204);
    }

    const listed = await readJson<{ items: SongRead[]; total: number }>(
      await client.get("/me/favorites"),
    );
    expect(listed.total).toBe(2);
    expect(listed.items.map((song) => song.title).sort()).toEqual([
      "De Música Ligera",
      "Nada Personal",
    ]);

    // Orden por fecha del like: la última likeada va primero.
    expect(listed.items[0]?.title).toBe("Nada Personal");

    const ids = await readJson<string[]>(await client.get("/me/favorites/ids"));
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids)).toEqual(new Set([songs[0]!.id, songs[1]!.id]));

    // Quitar
    const removed = await client.del(`/me/favorites/${songs[0]!.id}`);
    expect(removed.status).toBe(204);
    expect(
      (await readJson<{ total: number }>(await client.get("/me/favorites"))).total,
    ).toBe(1);

    // Quitar algo que no es favorito -> 404 (aunque la canción exista).
    const missing = crypto.randomUUID();
    const notFavorite = await client.del(`/me/favorites/${missing}`);
    expect(notFavorite.status).toBe(404);
    expect(await readJson(notFavorite)).toEqual({
      detail: `Canción ${missing} no existe`,
    });
  });

  it("like idempotente: repetir el PUT deja un solo favorito", async () => {
    const songs = await seedSongs();
    await registerAndLogin(client);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await client.request(`/me/favorites/${songs[0]!.id}`, {
        method: "PUT",
      });
      expect(response.status).toBe(204);
    }

    expect(
      (await readJson<{ total: number }>(await client.get("/me/favorites"))).total,
    ).toBe(1);
  });

  it("favoritear una canción inexistente -> 404", async () => {
    await registerAndLogin(client);
    const missing = crypto.randomUUID();

    const response = await client.request(`/me/favorites/${missing}`, {
      method: "PUT",
    });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      detail: `Canción ${missing} no existe`,
    });
  });

  it("requiere sesión", async () => {
    expect((await client.get("/me/favorites")).status).toBe(401);
    expect((await client.get("/me/favorites/ids")).status).toBe(401);
    expect(
      (await client.request(`/me/favorites/${crypto.randomUUID()}`, {
        method: "PUT",
      })).status,
    ).toBe(401);
  });

  it("el listado trae SongRead completo (álbum del favorito)", async () => {
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
    expect(page.items[0]?.id).toBe(song.id);
    expect(page.items[0]?.album?.id).toBe(album.id);
    expect(page.items[0]?.artist.id).toBe(artist.id);
  });
});
