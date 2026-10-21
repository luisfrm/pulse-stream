import { describe, expect, it, vi } from "vitest";

import { signSession } from "../src/auth/session";
import type { AppConfig } from "../src/config";
import type {
  CatalogRepository,
  ListSongsParams,
} from "../src/features/catalog/repository";
import { SONG_GENRES } from "../src/features/catalog/schema";
import {
  ALBUM_ID,
  ALBUM_READ,
  ARTIST_ID,
  ARTIST_READ,
  BASE_URL,
  COLLABORATOR_ID,
  PLAYLIST_ID,
  PLAYLIST_READ,
  SONG_ID,
  SONG_ID_2,
  SONG_READ,
  albumRecord,
  artistRecord,
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

function publicConfig(): AppConfig {
  return testConfig({ r2PublicBaseUrl: BASE_URL });
}

describe("GET /songs", () => {
  it("devuelve Page<SongRead> y reenvía todos los filtros al repository", async () => {
    const calls: ListSongsParams[] = [];
    const catalog = fakeCatalog({
      listSongs: async (params) => {
        calls.push(params);
        return { items: [songRecord()], total: 7 };
      },
    });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request(
      `/songs?offset=1&limit=2&q=parity&artist_id=${ARTIST_ID}` +
        `&collaborator_id=${COLLABORATOR_ID}&album_id=${ALBUM_ID}` +
        `&playlist_id=${PLAYLIST_ID}`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [SONG_READ],
      total: 7,
      offset: 1,
      limit: 2,
    });
    expect(calls).toEqual([
      {
        offset: 1,
        limit: 2,
        search: "parity",
        artistId: ARTIST_ID,
        collaboratorId: COLLABORATOR_ID,
        albumId: ALBUM_ID,
        playlistId: PLAYLIST_ID,
      },
    ]);
  });

  it("aplica los defaults de paginación (offset 0, limit 50)", async () => {
    const calls: ListSongsParams[] = [];
    const catalog = fakeCatalog({
      listSongs: async (params) => {
        calls.push(params);
        return { items: [], total: 0 };
      },
    });
    const { app } = buildTestApp({ catalog });

    const response = await app.request("/songs");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    });
    expect(calls[0]).toEqual({
      offset: 0,
      limit: 50,
      search: undefined,
      artistId: undefined,
      collaboratorId: undefined,
      albumId: undefined,
      playlistId: undefined,
    });
  });

  it("rechaza limit fuera de rango y UUIDs inválidos", async () => {
    const { app } = buildTestApp();

    const tooBig = await app.request("/songs?limit=101");
    expect(tooBig.status).toBe(400);
    await expect(tooBig.json()).resolves.toEqual({ detail: "Invalid request" });

    const badId = await app.request("/songs?artist_id=nope");
    expect(badId.status).toBe(400);

    const badQuery = await app.request(`/songs?q=${"x".repeat(256)}`);
    expect(badQuery.status).toBe(400);
  });
});

describe("GET /songs/popular", () => {
  it("usa la ventana de días y expone play_count de la ventana", async () => {
    let since = "";
    let limit = 0;
    const catalog = fakeCatalog({
      listPopularSongs: async (params) => {
        since = params.since;
        limit = params.limit;
        return [{ ...songRecord(), window_play_count: 12 }];
      },
    });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request("/songs/popular?days=7&limit=3");

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]?.play_count).toBe(12);
    expect(body[0]?.stream_url).toBe(SONG_READ.stream_url);
    expect(limit).toBe(3);

    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(new Date(since).getTime() - expected)).toBeLessThan(5_000);
  });

  it("con month=true arranca el primer día del mes calendario UTC", async () => {
    let since = "";
    const catalog = fakeCatalog({
      listPopularSongs: async (params) => {
        since = params.since;
        return [];
      },
    });
    const { app } = buildTestApp({ catalog });
    const now = new Date();

    const response = await app.request("/songs/popular?month=true");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(since).toBe(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    );
  });

  it("rechaza month con un valor no booleano", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/songs/popular?month=maybe");
    expect(response.status).toBe(400);
  });
});

describe("GET /songs/{id}", () => {
  it("devuelve el SongRead exacto", async () => {
    const catalog = fakeCatalog({ getSongById: async () => songRecord() });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request(`/songs/${SONG_ID}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual(SONG_READ);
    expect(Object.keys(body)).toEqual([
      "id",
      "title",
      "artist",
      "album",
      "genres",
      "lyrics",
      "object_key",
      "duration_seconds",
      "play_count",
      "created_at",
      "stream_url",
      "cover_url",
      "collaborators",
    ]);
  });

  it("404 {detail} si no existe", async () => {
    const { app } = buildTestApp();

    const response = await app.request(`/songs/${SONG_ID}`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: `Canción ${SONG_ID} no existe`,
    });
  });

  it("400 si el id no es UUID", async () => {
    const { app } = buildTestApp();
    const response = await app.request("/songs/not-a-uuid");
    expect(response.status).toBe(400);
  });
});

describe("GET /albums", () => {
  it("devuelve Page<AlbumRead> con song_count real", async () => {
    const catalog = fakeCatalog({
      listAlbums: async () => ({ items: [albumRecord()], total: 1 }),
    });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request("/albums?q=parity&artist_id=" + ARTIST_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [ALBUM_READ],
      total: 1,
      offset: 0,
      limit: 50,
    });
  });
});

describe("GET /albums/{id}", () => {
  it("propaga el song_count del álbum a cada song.album", async () => {
    const catalog = fakeCatalog({
      getAlbumWithSongs: async () => ({
        album: albumRecord({ song_count: 13 }),
        songs: [songRecord(), songRecord({ id: SONG_ID_2 })],
      }),
    });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request(`/albums/${ALBUM_ID}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      song_count: number;
      songs: Array<{ album: { song_count: number; cover_url: string } }>;
    };

    expect(body.song_count).toBe(13);
    expect(body.songs).toHaveLength(2);
    for (const song of body.songs) {
      expect(song.album.song_count).toBe(13);
      expect(song.album.cover_url).toBe(ALBUM_READ.cover_url);
    }
  });

  it("404 si el álbum no existe", async () => {
    const { app } = buildTestApp();

    const response = await app.request(`/albums/${ALBUM_ID}`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: `Álbum ${ALBUM_ID} no existe`,
    });
  });
});

describe("GET /artists", () => {
  it("lista artistas con el shape de ArtistRead", async () => {
    const catalog = fakeCatalog({
      listArtists: async () => ({ items: [artistRecord()], total: 1 }),
    });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request("/artists?q=parity");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [ARTIST_READ],
      total: 1,
      offset: 0,
      limit: 50,
    });
  });

  it("detalle 200 / 404", async () => {
    const catalog = fakeCatalog({ getArtistById: async () => artistRecord() });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const found = await app.request(`/artists/${ARTIST_ID}`);
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual(ARTIST_READ);

    const missingApp = buildTestApp().app;
    const missing = await missingApp.request(`/artists/${ARTIST_ID}`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      detail: `Artista ${ARTIST_ID} no existe`,
    });
  });
});

describe("GET /genres", () => {
  it("devuelve los 12 géneros de SongGenre", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/genres");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      "pop",
      "rock",
      "hip-hop",
      "electronic",
      "jazz",
      "classical",
      "reggaeton",
      "folk",
      "metal",
      "r&b",
      "latin",
      "indie",
    ]);
    expect(SONG_GENRES).toHaveLength(12);
  });
});

describe("GET /playlists/public", () => {
  it("devuelve Page<PlaylistRead> con owner_email", async () => {
    const calls: unknown[] = [];
    const catalog = fakeCatalog({
      listPublicPlaylists: async (params) => {
        calls.push(params);
        return { items: [playlistRecord()], total: 3 };
      },
    });
    const { app } = buildTestApp({ config: publicConfig(), catalog });

    const response = await app.request("/playlists/public?offset=0&limit=10");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [PLAYLIST_READ],
      total: 3,
      offset: 0,
      limit: 10,
    });
    expect(calls).toEqual([{ offset: 0, limit: 10 }]);
  });
});

describe("GET /playlists", () => {
  async function authorized(
    catalog: CatalogRepository,
  ): Promise<{ app: ReturnType<typeof buildTestApp>["app"]; userId: string }> {
    const user = fakeUser();
    const users = fakeRepository({
      getById: async (id) => (id === user.id ? user : null),
    });
    const { app } = buildTestApp({ config: publicConfig(), users, catalog });
    const token = await signSession(user.id, TEST_SECRET);
    return { app, userId: user.id };
  }

  it("sin sesión responde 401", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/playlists");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: "Unauthorized" });
  });

  it("mine=true (default) devuelve las del usuario", async () => {
    const mine = vi.fn(async () => [playlistRecord()]);
    const catalog = fakeCatalog({
      listPlaylistsByOwner: mine,
      listPublicPlaylistsByOwner: async () => [],
    });
    const { app, userId } = await authorized(catalog);

    const response = await app.request("/playlists", {
      headers: { cookie: `session=${await signSession(userId, TEST_SECRET)}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([PLAYLIST_READ]);
    expect(mine).toHaveBeenCalledWith(userId);
  });

  it("mine=false devuelve solo las públicas del mismo perfil", async () => {
    const publicOnly = vi.fn(async () => [playlistRecord()]);
    const catalog = fakeCatalog({
      listPlaylistsByOwner: async () => [],
      listPublicPlaylistsByOwner: publicOnly,
    });
    const { app } = await authorized(catalog);
    const token = await signSession(fakeUser().id, TEST_SECRET);

    const response = await app.request("/playlists?mine=false", {
      headers: { cookie: `session=${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([PLAYLIST_READ]);
    expect(publicOnly).toHaveBeenCalledWith(fakeUser().id);
  });
});

describe("GET /playlists/{id}", () => {
  const OTHER_USER_ID = "ad26a7b7-2d81-44ad-b905-d97a1e174ba8";

  async function requestPlaylist(
    catalog: CatalogRepository,
    playlistId: string = PLAYLIST_ID,
  ): Promise<Response> {
    const user = fakeUser();
    const users = fakeRepository({
      getById: async (id) => (id === user.id ? user : null),
    });
    const { app } = buildTestApp({ config: publicConfig(), users, catalog });
    const token = await signSession(user.id, TEST_SECRET);

    return await app.request(`/playlists/${playlistId}`, {
      headers: { cookie: `session=${token}` },
    });
  }

  it("devuelve PlaylistDetail con las canciones en orden", async () => {
    const catalog = fakeCatalog({
      getPlaylistWithSongs: async () => ({
        playlist: playlistRecord(),
        songs: [songRecord(), songRecord({ id: SONG_ID_2 })],
      }),
    });

    const response = await requestPlaylist(catalog);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      songs: Array<{ id: string; album: { song_count: number } | null }>;
    };
    expect(body.songs.map((song) => song.id)).toEqual([SONG_ID, SONG_ID_2]);
    expect(body.songs[0]?.album?.song_count).toBe(0);
    expect(body).toMatchObject({ id: PLAYLIST_ID, song_count: 2 });
  });

  it("404 si no existe", async () => {
    const response = await requestPlaylist(fakeCatalog());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: `Playlist ${PLAYLIST_ID} no existe`,
    });
  });

  it("403 si es privada y el usuario no es el dueño", async () => {
    const catalog = fakeCatalog({
      getPlaylistWithSongs: async () => ({
        playlist: playlistRecord({ is_public: false, owner_id: OTHER_USER_ID }),
        songs: [],
      }),
    });

    const response = await requestPlaylist(catalog);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      detail: "No tenés acceso a esta playlist",
    });
  });

  it("el dueño sí ve su playlist privada", async () => {
    const owner = fakeUser();
    const catalog = fakeCatalog({
      getPlaylistWithSongs: async () => ({
        playlist: playlistRecord({ is_public: false, owner_id: owner.id }),
        songs: [songRecord()],
      }),
    });
    const users = fakeRepository({
      getById: async (id) => (id === owner.id ? owner : null),
    });
    const { app } = buildTestApp({ config: publicConfig(), users, catalog });
    const token = await signSession(owner.id, TEST_SECRET);

    const response = await app.request(`/playlists/${PLAYLIST_ID}`, {
      headers: { cookie: `session=${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { songs: unknown[] };
    expect(body.songs).toHaveLength(1);
  });

  it("sin sesión responde 401 (aunque la playlist sea pública)", async () => {
    const { app } = buildTestApp();
    const response = await app.request(`/playlists/${PLAYLIST_ID}`);
    expect(response.status).toBe(401);
  });
});
