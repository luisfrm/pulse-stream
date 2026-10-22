import { describe, expect, it, vi } from "vitest";

import { signSession } from "../src/auth/session";
import type { CatalogRepository } from "../src/features/catalog/repository";
import { UsernameTakenError } from "../src/features/users/repository";
import type { WritesRepository } from "../src/features/writes/repository";
import {
  ALBUM_ID,
  BASE_URL,
  OTHER_PLAYLIST_ID,
  PLAYLIST_ID,
  SONG_ID,
  albumRecord,
  playlistRecord,
  songRecord,
} from "./catalog-fixtures";
import {
  TEST_SECRET,
  TEST_USER_ID,
  buildTestApp,
  fakeCatalog,
  fakeCoverPresigner,
  fakeRepository,
  fakeUser,
  fakeWrites,
  testConfig,
} from "./helpers";

const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const COVER_KEY = "covers/123e4567-e89b-42d3-a456-426614174000.webp";

function playlistDetail(overrides: Parameters<typeof playlistRecord>[0] = {}) {
  return {
    playlist: playlistRecord({ owner_id: TEST_USER_ID, ...overrides }),
    songs: [songRecord()],
  };
}

function baseCatalog(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return fakeCatalog({
    getSongById: async () => songRecord(),
    getAlbumWithSongs: async () => ({
      album: albumRecord(),
      songs: [],
    }),
    getPlaylistWithSongs: async () => playlistDetail(),
    ...overrides,
  });
}

async function authedApp(options: {
  catalog?: CatalogRepository;
  writes?: WritesRepository;
  role?: "admin" | null;
  isSuperuser?: boolean;
  coverPresigner?: ReturnType<typeof fakeCoverPresigner> | null;
} = {}) {
  const user = fakeUser({
    id: TEST_USER_ID,
    role: options.role ?? null,
    is_superuser: options.isSuperuser ?? false,
  });
  const users = fakeRepository({
    getById: async (id) => (id === user.id ? user : null),
  });
  const writes = options.writes ?? fakeWrites();
  const { app } = buildTestApp({
    config: testConfig({ r2PublicBaseUrl: BASE_URL }),
    users,
    catalog: options.catalog ?? baseCatalog(),
    writes,
    coverPresigner:
      options.coverPresigner === undefined
        ? fakeCoverPresigner()
        : options.coverPresigner,
  });
  const token = await signSession(user.id, TEST_SECRET);
  return { app, cookie: `session=${token}`, user, writes };
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function withCookies(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string>), cookie },
  };
}

describe("favoritos (escrituras)", () => {
  it("PUT /me/favorites/{song_id} → 204 e idempotente", async () => {
    const add = vi.fn(async () => undefined);
    const { app, cookie } = await authedApp({
      writes: fakeWrites({ addFavoriteSong: add }),
    });

    for (let index = 0; index < 2; index += 1) {
      const response = await app.request(
        `/me/favorites/${SONG_ID}`,
        withCookies(cookie, { method: "PUT" }),
      );
      expect(response.status).toBe(204);
    }
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledWith(TEST_USER_ID, SONG_ID);
  });

  it("PUT /me/favorites/{song_id} con canción inexistente → 404", async () => {
    const { app, cookie } = await authedApp({
      catalog: baseCatalog({ getSongById: async () => null }),
    });

    const response = await app.request(
      "/me/favorites/c1111111-1111-4111-8111-111111111111",
      withCookies(cookie, { method: "PUT" }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: `Canción c1111111-1111-4111-8111-111111111111 no existe`,
    });
  });

  it("DELETE /me/favorites/{song_id} → 204; si no existía → 404", async () => {
    const ok = await authedApp({
      writes: fakeWrites({ removeFavoriteSong: async () => true }),
    });
    const missing = await authedApp({
      writes: fakeWrites({ removeFavoriteSong: async () => false }),
    });

    const first = await ok.app.request(
      `/me/favorites/${SONG_ID}`,
      withCookies(ok.cookie, { method: "DELETE" }),
    );
    const second = await missing.app.request(
      `/me/favorites/${SONG_ID}`,
      withCookies(missing.cookie, { method: "DELETE" }),
    );

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
  });

  it("favoritos de álbum y playlist", async () => {
    const { app, cookie } = await authedApp();

    const album = await app.request(
      `/me/favorites/albums/${ALBUM_ID}`,
      withCookies(cookie, { method: "PUT" }),
    );
    const playlist = await app.request(
      `/me/favorites/playlists/${PLAYLIST_ID}`,
      withCookies(cookie, { method: "PUT" }),
    );

    expect(album.status).toBe(204);
    expect(playlist.status).toBe(204);
  });

  it("like de playlist privada ajena → 403", async () => {
    const { app, cookie } = await authedApp({
      catalog: baseCatalog({
        getPlaylistWithSongs: async () => ({
          playlist: playlistRecord({
            owner_id: OTHER_USER_ID,
            is_public: false,
          }),
          songs: [],
        }),
      }),
    });

    const response = await app.request(
      `/me/favorites/playlists/${OTHER_PLAYLIST_ID}`,
      withCookies(cookie, { method: "PUT" }),
    );

    expect(response.status).toBe(403);
  });

  it("sin sesión → 401", async () => {
    const { app } = await authedApp();
    const response = await app.request(`/me/favorites/${SONG_ID}`, {
      method: "PUT",
    });
    expect(response.status).toBe(401);
  });
});

describe("playlists de usuario (escrituras)", () => {
  it("POST /playlists → 201 PlaylistDetail", async () => {
    const create = vi.fn(async () => PLAYLIST_ID);
    const { app, cookie } = await authedApp({
      writes: fakeWrites({ createPlaylist: create }),
    });

    const response = await app.request(
      "/playlists",
      withCookies(cookie, json({ name: "Nueva", description: "x", is_public: true })),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string };
    expect(body.id).toBe(PLAYLIST_ID);
    expect(create).toHaveBeenCalledWith({
      ownerId: TEST_USER_ID,
      name: "Nueva",
      description: "x",
      isPublic: true,
      kind: "user",
      query: null,
    });
  });

  it("PATCH /playlists/{id} del dueño → 200; ajeno → 403", async () => {
    const own = await authedApp();
    const ownResponse = await own.app.request(
      `/playlists/${PLAYLIST_ID}`,
      withCookies(own.cookie, { ...json({ name: "Editada" }), method: "PATCH" }),
    );
    expect(ownResponse.status).toBe(200);

    const foreign = await authedApp({
      catalog: baseCatalog({
        getPlaylistWithSongs: async () => ({
          playlist: playlistRecord({ owner_id: OTHER_USER_ID }),
          songs: [],
        }),
      }),
    });
    const foreignResponse = await foreign.app.request(
      `/playlists/${PLAYLIST_ID}`,
      withCookies(foreign.cookie, { ...json({ name: "Editada" }), method: "PATCH" }),
    );
    expect(foreignResponse.status).toBe(403);
  });

  it("system: ningún usuario de la app la muta (ni siquiera admin legacy)", async () => {
    const systemCatalog = () =>
      baseCatalog({
        getPlaylistWithSongs: async () => ({
          playlist: playlistRecord({
            kind: "system",
            is_public: true,
            owner_id: TEST_USER_ID,
          }),
          songs: [],
        }),
      });

    const normal = await authedApp({ catalog: systemCatalog() });
    const admin = await authedApp({
      catalog: systemCatalog(),
      role: "admin",
      isSuperuser: true,
    });

    const normalResponse = await normal.app.request(
      `/playlists/${PLAYLIST_ID}`,
      withCookies(normal.cookie, { ...json({ name: "x" }), method: "PATCH" }),
    );
    const adminResponse = await admin.app.request(
      `/playlists/${PLAYLIST_ID}`,
      withCookies(admin.cookie, { ...json({ name: "x" }), method: "PATCH" }),
    );

    expect(normalResponse.status).toBe(403);
    expect(adminResponse.status).toBe(403);
  });

  it("DELETE /playlists/{id} → 204", async () => {
    const { app, cookie } = await authedApp();
    const response = await app.request(
      `/playlists/${PLAYLIST_ID}`,
      withCookies(cookie, { method: "DELETE" }),
    );
    expect(response.status).toBe(204);
  });

  it("POST /songs agrega al final; duplicado no-op", async () => {
    const add = vi.fn(async () => true);
    const duplicate = vi.fn(async () => false);
    const first = await authedApp({ writes: fakeWrites({ addPlaylistSong: add }) });
    const second = await authedApp({
      writes: fakeWrites({ addPlaylistSong: duplicate }),
    });

    const firstResponse = await first.app.request(
      `/playlists/${PLAYLIST_ID}/songs`,
      withCookies(first.cookie, json({ song_id: SONG_ID })),
    );
    const secondResponse = await second.app.request(
      `/playlists/${PLAYLIST_ID}/songs`,
      withCookies(second.cookie, json({ song_id: SONG_ID })),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.headers.get("content-type")).toContain("application/json");
    expect(add).toHaveBeenCalledWith(PLAYLIST_ID, SONG_ID);
  });

  it("DELETE /songs/{song_id}: renumeró → 200; no estaba → 404", async () => {
    const ok = await authedApp({
      writes: fakeWrites({ removePlaylistSong: async () => true }),
    });
    const missing = await authedApp({
      writes: fakeWrites({ removePlaylistSong: async () => false }),
    });

    const first = await ok.app.request(
      `/playlists/${PLAYLIST_ID}/songs/${SONG_ID}`,
      withCookies(ok.cookie, { method: "DELETE" }),
    );
    const second = await missing.app.request(
      `/playlists/${PLAYLIST_ID}/songs/${SONG_ID}`,
      withCookies(missing.cookie, { method: "DELETE" }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
  });

  it("playlist inexistente → 404", async () => {
    const { app, cookie } = await authedApp({
      catalog: baseCatalog({ getPlaylistWithSongs: async () => null }),
    });

    const response = await app.request(
      `/playlists/${PLAYLIST_ID}`,
      withCookies(cookie, { ...json({ name: "x" }), method: "PATCH" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("POST /me/listens", () => {
  it("registra y devuelve ListenRead con fecha ISO UTC", async () => {
    const record = vi.fn(async () => ({
      id: "f1111111-1111-4111-8111-111111111111",
      song_id: SONG_ID,
      played_at: "2026-10-21T10:11:12.345678",
    }));
    const { app, cookie } = await authedApp({
      writes: fakeWrites({ recordListen: record }),
    });

    const response = await app.request(
      "/me/listens",
      withCookies(cookie, json({ song_id: SONG_ID })),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "f1111111-1111-4111-8111-111111111111",
      song_id: SONG_ID,
      played_at: "2026-10-21T10:11:12.345678Z",
    });
    expect(record).toHaveBeenCalledWith(TEST_USER_ID, SONG_ID);
  });

  it("canción inexistente → 404; sin sesión → 401", async () => {
    const missing = await authedApp({
      catalog: baseCatalog({ getSongById: async () => null }),
    });
    const unauth = await authedApp();

    const missingResponse = await missing.app.request(
      "/me/listens",
      withCookies(missing.cookie, json({ song_id: SONG_ID })),
    );
    const unauthResponse = await unauth.app.request("/me/listens", json({ song_id: SONG_ID }));

    expect(missingResponse.status).toBe(404);
    expect(unauthResponse.status).toBe(401);
  });
});

describe("PATCH /users/me", () => {
  it("actualiza username/cover y devuelve UserRead", async () => {
    const update = vi.fn(async () =>
      fakeUser({
        id: TEST_USER_ID,
        username: "nuevo",
        cover_key: COVER_KEY,
      }),
    );
    const { app, cookie } = await authedApp({
      writes: fakeWrites({ updateUserProfile: update }),
    });

    const response = await app.request(
      "/users/me",
      withCookies(cookie, {
        ...json({ username: "nuevo", cover_key: COVER_KEY }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { username: string; cover_key: string };
    expect(body.username).toBe("nuevo");
    expect(body.cover_key).toBe(COVER_KEY);
    expect(update).toHaveBeenCalledWith(TEST_USER_ID, {
      username: "nuevo",
      coverKey: COVER_KEY,
    });
  });

  it("ignora role/is_superuser y campos de auth", async () => {
    const update = vi.fn(async () => fakeUser({ id: TEST_USER_ID }));
    const { app, cookie } = await authedApp({
      writes: fakeWrites({ updateUserProfile: update }),
    });

    const response = await app.request(
      "/users/me",
      withCookies(cookie, {
        ...json({
          username: "nuevo",
          role: "admin",
          is_superuser: true,
          email: "evil@example.com",
          password: "hack",
        }),
        method: "PATCH",
      }),
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(TEST_USER_ID, { username: "nuevo" });
    const body = (await response.json()) as { role: string | null; is_superuser: boolean };
    expect(body.role).toBeNull();
    expect(body.is_superuser).toBe(false);
  });

  it("username tomado → 400; cover_key inválido → 400; sin sesión → 401", async () => {
    const taken = await authedApp({
      writes: fakeWrites({
        updateUserProfile: async () => {
          throw new UsernameTakenError();
        },
      }),
    });
    const invalid = await authedApp();

    const takenResponse = await taken.app.request(
      "/users/me",
      withCookies(taken.cookie, {
        ...json({ username: "tomado" }),
        method: "PATCH",
      }),
    );
    const invalidResponse = await invalid.app.request(
      "/users/me",
      withCookies(invalid.cookie, {
        ...json({ cover_key: "covers/no.webp" }),
        method: "PATCH",
      }),
    );
    const unauthResponse = await invalid.app.request("/users/me", {
      ...json({ username: "nuevo" }),
      method: "PATCH",
    });

    expect(takenResponse.status).toBe(400);
    await expect(takenResponse.json()).resolves.toEqual({
      detail: "El nombre de usuario ya está en uso",
    });
    expect(invalidResponse.status).toBe(400);
    expect(unauthResponse.status).toBe(401);
  });
});

describe("POST /uploads/presign-cover", () => {
  it("firma WebP <= 256 KB y devuelve la key del presign", async () => {
    const presign = vi.fn(async () => "https://r2.example.com/signed");
    const { app, cookie } = await authedApp({
      coverPresigner: fakeCoverPresigner({ presignPut: presign }),
    });

    const response = await app.request(
      "/uploads/presign-cover",
      withCookies(cookie, json({ content_type: "image/webp", size: 1024 })),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      url: string;
      object_key: string;
      content_type: string;
      expires_in: number;
    };
    expect(body.url).toBe("https://r2.example.com/signed");
    expect(body.object_key).toMatch(/^covers\/[0-9a-f-]+\.webp$/);
    expect(body.content_type).toBe("image/webp");
    expect(body.expires_in).toBe(600);
    expect(presign).toHaveBeenCalledWith({
      objectKey: body.object_key,
      contentType: "image/webp",
    });
  });

  it("tipo/tamaño inválido → 400; R2 sin configurar → 503; sin sesión → 401", async () => {
    const { app, cookie } = await authedApp();
    const noR2 = await authedApp({ coverPresigner: null });

    const type = await app.request(
      "/uploads/presign-cover",
      withCookies(cookie, json({ content_type: "image/png", size: 1024 })),
    );
    const size = await app.request(
      "/uploads/presign-cover",
      withCookies(cookie, json({ content_type: "image/webp", size: 256 * 1024 + 1 })),
    );
    const unavailable = await noR2.app.request(
      "/uploads/presign-cover",
      withCookies(noR2.cookie, json({ content_type: "image/webp", size: 1024 })),
    );
    const unauth = await app.request(
      "/uploads/presign-cover",
      json({ content_type: "image/webp", size: 1024 }),
    );

    expect(type.status).toBe(400);
    expect(size.status).toBe(400);
    expect(unavailable.status).toBe(503);
    expect(unauth.status).toBe(401);
  });
});
