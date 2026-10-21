import { createApp } from "../src/app";
import type { GoogleClient } from "../src/auth/google";
import type { AppConfig } from "../src/config";
import type {
  UserRecord,
  UserRepository,
} from "../src/features/users/repository";

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
    findByOAuth: async () => null,
    createUserWithOAuth: async () => {
      throw new Error("createUserWithOAuth not stubbed");
    },
    linkOAuth: async () => undefined,
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
  google?: GoogleClient;
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  config: AppConfig;
  users: UserRepository;
  google: GoogleClient;
}

export function buildTestApp(options: TestAppOptions = {}): TestApp {
  const config = options.config ?? testConfig();
  const users = options.users ?? fakeRepository();
  const google = options.google ?? fakeGoogle();

  return { app: createApp({ config, users, google }), config, users, google };
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
