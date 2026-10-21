import { createApp } from "../src/app";
import type { GoogleClient } from "../src/auth/google";
import type { AppConfig } from "../src/config";
import type { CatalogRepository } from "../src/features/catalog/repository";
import type { CoverPresigner } from "../src/features/uploads/presign";
import type {
  UserRecord,
  UserRepository,
} from "../src/features/users/repository";
import type {
  ListenRecord,
  WritesRepository,
} from "../src/features/writes/repository";

export const TEST_SECRET = "test-auth-secret-with-enough-entropy-0123456789";
export const TEST_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
export const TEST_CLIENT_SECRET = "test-client-secret";
export const TEST_REDIRECT_URI =
  "http://localhost:8787/auth/google/callback";
export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base: AppConfig = {
    env: "local",
    appUrl: "http://localhost:3000",
    cookieDomain: null,
    corsOrigins: ["http://localhost:3000"],
    authSecret: TEST_SECRET,
    google: {
      clientId: TEST_CLIENT_ID,
      clientSecret: TEST_CLIENT_SECRET,
      redirectUri: TEST_REDIRECT_URI,
    },
    r2PublicBaseUrl: "",
    r2: {
      accountId: "",
      accessKeyId: "",
      secretAccessKey: "",
      bucketName: "",
    },
  };

  return {
    ...base,
    ...overrides,
    google: { ...base.google, ...(overrides.google ?? {}) },
  };
}

export function fakeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: TEST_USER_ID,
    email: "user@example.com",
    hashed_password: null,
    is_active: true,
    is_superuser: false,
    is_verified: true,
    role: null,
    username: "user",
    cover_key: null,
    total_plays: 0,
    ...overrides,
  };
}

export function fakeRepository(
  overrides: Partial<UserRepository> = {},
): UserRepository {
  return {
    getById: async () => null,
    findByEmail: async () => null,
    findByIdentifier: async () => null,
    findByOAuth: async () => null,
    createUserWithOAuth: async () => {
      throw new Error("createUserWithOAuth not stubbed");
    },
    linkOAuth: async () => undefined,
    ...overrides,
  };
}

/** `CatalogRepository` vacío (todas las lecturas devuelven listas vacías). */
export function fakeCatalog(
  overrides: Partial<CatalogRepository> = {},
): CatalogRepository {
  return {
    listSongs: async () => ({ items: [], total: 0 }),
    listPopularSongs: async () => [],
    getSongById: async () => null,
    listAlbums: async () => ({ items: [], total: 0 }),
    getAlbumWithSongs: async () => null,
    listArtists: async () => ({ items: [], total: 0 }),
    getArtistById: async () => null,
    listPublicPlaylists: async () => ({ items: [], total: 0 }),
    listPlaylistsByOwner: async () => [],
    listPublicPlaylistsByOwner: async () => [],
    getPlaylistWithSongs: async () => null,
    listFavoriteSongs: async () => ({ items: [], total: 0 }),
    listFavoriteSongIds: async () => [],
    listFavoriteAlbums: async () => ({ items: [], total: 0 }),
    listFavoriteAlbumIds: async () => [],
    listFavoritePlaylists: async () => ({ items: [], total: 0 }),
    listFavoritePlaylistIds: async () => [],
    getLibraryIds: async () => ({
      song_ids: [],
      album_ids: [],
      playlist_ids: [],
    }),
    listMyPlaylists: async () => [],
    listMyPlaylistsPage: async () => ({ items: [], total: 0 }),
    listRecentlyPlayed: async () => ({ items: [], total: 0 }),
    ...overrides,
  };
}

export const TEST_LISTEN_ID = "f1111111-1111-4111-8111-111111111111";
export const TEST_SONG_ID = "c1111111-1111-4111-8111-111111111111";
export const TEST_PLAYLIST_ID = "e1111111-1111-4111-8111-111111111111";
export const TEST_PRESIGNED_URL =
  "https://account.r2.cloudflarestorage.com/bucket/covers/fake.webp?X-Amz-Signature=fake";

/**
 * `WritesRepository` en memoria: registra nada y responde éxito.
 *
 * Los tests de rutas overridean solo lo que necesitan y verifican las
 * llamadas; el SQL real se cubre en `writes-repository.test.ts` y en el smoke.
 */
export function fakeWrites(
  overrides: Partial<WritesRepository> = {},
): WritesRepository {
  return {
    addFavoriteSong: async () => undefined,
    removeFavoriteSong: async () => true,
    addFavoriteAlbum: async () => undefined,
    removeFavoriteAlbum: async () => true,
    addFavoritePlaylist: async () => undefined,
    removeFavoritePlaylist: async () => true,
    createPlaylist: async () => TEST_PLAYLIST_ID,
    updatePlaylist: async () => undefined,
    deletePlaylist: async () => undefined,
    addPlaylistSong: async () => true,
    removePlaylistSong: async () => true,
    recordListen: async (userId, songId): Promise<ListenRecord> => ({
      id: TEST_LISTEN_ID,
      song_id: songId,
      played_at: "2026-10-21T10:11:12.345678",
    }),
    updateUserProfile: async (userId, fields) => ({
      ...fakeUser({ id: userId }),
      ...(fields.username !== undefined ? { username: fields.username } : {}),
      ...(fields.coverKey !== undefined ? { cover_key: fields.coverKey } : {}),
    }),
    ...overrides,
  };
}

/** Firmador fake de covers (sin red). */
export function fakeCoverPresigner(
  overrides: Partial<CoverPresigner> = {},
): CoverPresigner {
  return {
    presignPut: async () => TEST_PRESIGNED_URL,
    ...overrides,
  };
}

export function fakeGoogle(overrides: Partial<GoogleClient> = {}): GoogleClient {
  return {
    buildAuthUrl: ({ state, codeChallenge }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(
        state,
      )}&code_challenge=${encodeURIComponent(codeChallenge)}`,
    exchangeCode: async () => ({ idToken: "test-id-token" }),
    verifyIdToken: async () => ({
      subject: "google-subject",
      email: "user@example.com",
      emailVerified: true,
    }),
    ...overrides,
  };
}

export interface TestAppOptions {
  config?: AppConfig;
  users?: UserRepository;
  catalog?: CatalogRepository;
  writes?: WritesRepository;
  google?: GoogleClient;
  /** `null` (default) = R2 no configurado (presign-cover 503). */
  coverPresigner?: CoverPresigner | null;
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  config: AppConfig;
  users: UserRepository;
  catalog: CatalogRepository;
  writes: WritesRepository;
  google: GoogleClient;
  coverPresigner: CoverPresigner | null;
}

export function buildTestApp(options: TestAppOptions = {}): TestApp {
  const config = options.config ?? testConfig();
  const users = options.users ?? fakeRepository();
  const catalog = options.catalog ?? fakeCatalog();
  const writes = options.writes ?? fakeWrites();
  const google = options.google ?? fakeGoogle();
  const coverPresigner = options.coverPresigner ?? null;

  return {
    app: createApp({ config, users, catalog, writes, google, coverPresigner }),
    config,
    users,
    catalog,
    writes,
    google,
    coverPresigner,
  };
}

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] };

export function setCookies(response: Response): string[] {
  const headers = response.headers as HeadersWithSetCookie;
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

export function findSetCookie(
  response: Response,
  name: string,
): string | undefined {
  return setCookies(response).find((cookie) =>
    cookie.startsWith(`${name}=`),
  );
}

/** Valor de una cookie `Set-Cookie` (sin atributos). */
export function cookieValue(setCookie: string): string {
  const equals = setCookie.indexOf("=");
  const semicolon = setCookie.indexOf(";", equals);
  return setCookie.slice(
    equals + 1,
    semicolon === -1 ? undefined : semicolon,
  );
}
