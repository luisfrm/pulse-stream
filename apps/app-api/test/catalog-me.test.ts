import { describe, expect, it, vi } from "vitest";

import { signSession } from "../src/auth/session";
import type { CatalogRepository } from "../src/features/catalog/repository";
import {
  ALBUM_ID,
  ALBUM_READ,
  BASE_URL,
  PLAYLIST_ID,
  PLAYLIST_READ,
  SONG_ID,
  SONG_ID_2,
  SONG_READ,
  albumRecord,
  myPlaylistRecord,
  playlistRecord,
  songRecord,
} from "./catalog-fixtures";
import {
  TEST_SECRET,
  buildTestApp,
  fakeCatalog,
  fakeRepository,
  fakeUser,
  testConfig,
} from "./helpers";

async function authedApp(catalog: CatalogRepository) {
  const user = fakeUser();
  const users = fakeRepository({
    getById: async (id) => (id === user.id ? user : null),
  });
  const { app } = buildTestApp({
    config: testConfig({ r2PublicBaseUrl: BASE_URL }),
    users,
    catalog,
  });
  const token = await signSession(user.id, TEST_SECRET);

  return { app, cookie: `session=${token}`, user };
}

const ME_ENDPOINTS = [
  "/me/favorites",
  "/me/favorites/ids",
  "/me/favorites/albums",
  "/me/favorites/albums/ids",
  "/me/favorites/playlists",
  "/me/favorites/playlists/ids",
  "/me/library/ids",
  "/me/playlists",
  "/me/playlists/page",
  "/me/recently-played",
];

describe("/me/* requiere sesión", () => {
  for (const path of ME_ENDPOINTS) {
    it(`${path} sin cookie → 401 {detail}`, async () => {
      const { app } = buildTestApp();

      const response = await app.request(path);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        detail: "Unauthorized",
      });
    });
  }
});

describe("GET /me/favorites", () => {
  it("devuelve Page<SongRead> ordenado por like y reenvía paginación", async () => {
    const calls: unknown[] = [];
    const catalog = fakeCatalog({
      listFavoriteSongs: async (params) => {
        calls.push(params);
        return { items: [songRecord()], total: 4 };
      },
    });
    const { app, cookie, user } = await authedApp(catalog);

    const response = await app.request("/me/favorites?offset=2&limit=10", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [SONG_READ],
      total: 4,
      offset: 2,
      limit: 10,
    });
    expect(calls).toEqual([{ userId: user.id, offset: 2, limit: 10 }]);
  });

  it("el álbum anidado de un favorito trae song_count 0", async () => {
    const catalog = fakeCatalog({
      listFavoriteSongs: async () => ({
        items: [songRecord({ album: albumRecord({ song_count: 13 }) })],
        total: 1,
      }),
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/favorites", {
      headers: { cookie },
    });

    const body = (await response.json()) as {
      items: Array<{ album: { song_count: number } | null }>;
    };
    expect(body.items[0]?.album?.song_count).toBe(0);
  });
});

describe("IDs de favoritos", () => {
  it("GET /me/favorites/ids devuelve los UUIDs ordenados", async () => {
    const catalog = fakeCatalog({
      listFavoriteSongIds: async () => [SONG_ID, SONG_ID_2].sort(),
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/favorites/ids", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      [SONG_ID, SONG_ID_2].sort(),
    );
  });

  it("GET /me/favorites/albums/ids devuelve los UUIDs ordenados", async () => {
    const catalog = fakeCatalog({
      listFavoriteAlbumIds: async () => [ALBUM_ID],
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/favorites/albums/ids", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([ALBUM_ID]);
  });

  it("GET /me/favorites/playlists/ids devuelve los UUIDs ordenados", async () => {
    const catalog = fakeCatalog({
      listFavoritePlaylistIds: async () => [PLAYLIST_ID],
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/favorites/playlists/ids", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([PLAYLIST_ID]);
  });
});

describe("GET /me/favorites/albums", () => {
  it("devuelve Page<AlbumRead> con song_count real", async () => {
    const catalog = fakeCatalog({
      listFavoriteAlbums: async () => ({ items: [albumRecord()], total: 1 }),
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/favorites/albums", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [ALBUM_READ],
      total: 1,
      offset: 0,
      limit: 50,
    });
  });
});

describe("GET /me/favorites/playlists", () => {
  it("devuelve Page<PlaylistRead>", async () => {
    const catalog = fakeCatalog({
      listFavoritePlaylists: async () => ({
        items: [playlistRecord()],
        total: 1,
      }),
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/favorites/playlists", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [PLAYLIST_READ],
      total: 1,
      offset: 0,
      limit: 50,
    });
  });
});

describe("GET /me/library/ids", () => {
  it("devuelve los 3 sets en una sola respuesta", async () => {
    const catalog = fakeCatalog({
      getLibraryIds: async () => ({
        song_ids: [SONG_ID],
        album_ids: [ALBUM_ID],
        playlist_ids: [PLAYLIST_ID],
      }),
    });
    const { app, cookie } = await authedApp(catalog);

    const response = await app.request("/me/library/ids", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      song_ids: [SONG_ID],
      album_ids: [ALBUM_ID],
      playlist_ids: [PLAYLIST_ID],
    });
    expect(Object.keys(body)).toEqual([
      "song_ids",
      "album_ids",
      "playlist_ids",
    ]);
  });
});

describe("GET /me/playlists", () => {
  it("devuelve MyPlaylistRead con song_ids en orden de posición", async () => {
    const calls: string[] = [];
    const catalog = fakeCatalog({
      listMyPlaylists: async (userId) => {
        calls.push(userId);
        return [myPlaylistRecord()];
      },
    });
    const { app, cookie, user } = await authedApp(catalog);

    const response = await app.request("/me/playlists", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toEqual([
      {
        ...PLAYLIST_READ,
        song_ids: [SONG_ID, SONG_ID_2],
      },
    ]);
    expect(body[0]).not.toHaveProperty("songs");
    expect(calls).toEqual([user.id]);
  });

  it("sin playlists devuelve []", async () => {
    const { app, cookie } = await authedApp(fakeCatalog());

    const response = await app.request("/me/playlists", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});

describe("GET /me/playlists/page", () => {
  it("pagina con offset/limit y default 20", async () => {
    const calls: unknown[] = [];
    const catalog = fakeCatalog({
      listMyPlaylistsPage: async (params) => {
        calls.push(params);
        return { items: [myPlaylistRecord()], total: 21 };
      },
    });
    const { app, cookie, user } = await authedApp(catalog);

    const response = await app.request("/me/playlists/page?offset=20&limit=20", {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ ...PLAYLIST_READ, song_ids: [SONG_ID, SONG_ID_2] }],
      total: 21,
      offset: 20,
      limit: 20,
    });
    expect(calls).toEqual([{ userId: user.id, offset: 20, limit: 20 }]);

    const defaults = await app.request("/me/playlists/page", {
      headers: { cookie },
    });
    const body = (await defaults.json()) as { limit: number };
    expect(body.limit).toBe(20);
  });

  it("rechaza limit fuera de rango", async () => {
    const { app, cookie } = await authedApp(fakeCatalog());
    const response = await app.request("/me/playlists/page?limit=101", {
      headers: { cookie },
    });
    expect(response.status).toBe(400);
  });
});

describe("GET /me/recently-played", () => {
  it("devuelve Page<RecentlyPlayedSong> con user_play_count", async () => {
    const calls: unknown[] = [];
    const catalog = fakeCatalog({
      listRecentlyPlayed: async (params) => {
        calls.push(params);
        return {
          items: [
            { ...songRecord(), user_play_count: 3 },
            { ...songRecord({ id: SONG_ID_2 }), user_play_count: 1 },
          ],
          total: 2,
        };
      },
    });
    const { app, cookie, user } = await authedApp(catalog);

    const response = await app.request(
      "/me/recently-played?offset=0&limit=5",
      { headers: { cookie } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
      offset: number;
      limit: number;
    };
    expect(body.total).toBe(2);
    expect(body.items.map((item) => item.id)).toEqual([SONG_ID, SONG_ID_2]);
    expect(body.items[0]?.user_play_count).toBe(3);
    expect(body.items[0]).toMatchObject(SONG_READ);
    expect(calls).toEqual([{ userId: user.id, offset: 0, limit: 5 }]);
  });

  it("no se cachea: dos llamadas ejecutan el repository dos veces", async () => {
    const spy = vi.fn(async () => ({ items: [], total: 0 }));
    const catalog = fakeCatalog({ listRecentlyPlayed: spy });
    const { app, cookie } = await authedApp(catalog);

    await app.request("/me/recently-played", { headers: { cookie } });
    await app.request("/me/recently-played", { headers: { cookie } });

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("paridad de nombres de campos", () => {
  it("AlbumRead, ArtistRead y PlaylistRead exponen solo las claves del contrato", async () => {
    expect(Object.keys(ALBUM_READ)).toEqual([
      "id",
      "title",
      "artist",
      "cover_key",
      "cover_url",
      "song_count",
      "created_at",
    ]);
    expect(Object.keys(ALBUM_READ.artist)).toEqual([
      "id",
      "name",
      "image_url",
      "cover_key",
      "created_at",
      "cover_url",
    ]);
    expect(Object.keys(PLAYLIST_READ)).toEqual([
      "id",
      "kind",
      "name",
      "description",
      "is_public",
      "cover_key",
      "cover_url",
      "song_count",
      "query",
      "owner_email",
      "created_at",
    ]);
  });
});
