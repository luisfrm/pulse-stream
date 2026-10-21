import { describe, expect, it, vi } from "vitest";

import {
  GOOGLE_TOKEN_ENDPOINT,
  createGoogleClient,
  signOAuthState,
  verifyOAuthState,
  type GoogleIdentity,
} from "../src/auth/google";
import { verifySession } from "../src/auth/session";
import type {
  CreateUserWithOAuthInput,
  UserRepository,
} from "../src/features/users/repository";
import {
  TEST_CLIENT_ID,
  TEST_CLIENT_SECRET,
  TEST_REDIRECT_URI,
  TEST_SECRET,
  TEST_USER_ID,
  buildTestApp,
  cookieValue,
  fakeGoogle,
  fakeRepository,
  fakeUser,
  findSetCookie,
  testConfig,
  type TestApp,
} from "./helpers";

async function startGoogle(app: TestApp["app"], returnTo?: string) {
  const suffix =
    returnTo === undefined
      ? ""
      : `?returnTo=${encodeURIComponent(returnTo)}`;
  const response = await app.request(`/auth/google${suffix}`);
  const location = response.headers.get("location");
  const stateCookie = findSetCookie(response, "oauth_state");

  if (!location || !stateCookie) {
    throw new Error("Google start did not redirect or set oauth_state");
  }

  const url = new URL(location);
  return {
    response,
    url,
    stateCookie,
    state: url.searchParams.get("state") ?? "",
  };
}

function happyRepository(
  overrides: Partial<UserRepository> = {},
): UserRepository {
  return fakeRepository({
    findByOAuth: async () => null,
    findByEmail: async () => null,
    createUserWithOAuth: async (input: CreateUserWithOAuthInput) =>
      fakeUser({
        id: TEST_USER_ID,
        email: input.email,
        username: input.username,
      }),
    ...overrides,
  });
}

describe("GET /auth/google", () => {
  it("redirige a Google con state, PKCE y cookie oauth_state", async () => {
    const config = testConfig();
    const google = createGoogleClient(config.google);
    const { app } = buildTestApp({ config, google });

    const { response, url, stateCookie, state } = await startGoogle(
      app,
      "/settings",
    );

    expect(response.status).toBe(302);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(TEST_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(TEST_REDIRECT_URI);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const payload = await verifyOAuthState(
      cookieValue(stateCookie),
      TEST_SECRET,
    );
    expect(payload.state).toBe(state);
    expect(payload.returnTo).toBe("/settings");
    expect(payload.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const attributes = stateCookie.toLowerCase();
    expect(attributes).toContain("httponly");
    expect(attributes).toContain("path=/auth");
    expect(attributes).toContain("max-age=600");
    expect(attributes).toContain("samesite=lax");
    expect(attributes).not.toContain("secure");
  });

  it("usa Secure + Domain fuera de local", async () => {
    const config = testConfig({
      env: "prod",
      cookieDomain: ".luisrivas.site",
    });
    const { app } = buildTestApp({ config });

    const { stateCookie } = await startGoogle(app);

    const attributes = stateCookie.toLowerCase();
    expect(attributes).toContain("secure");
    expect(attributes).toContain("domain=.luisrivas.site");
  });

  it("responde 503 si Google no está configurado", async () => {
    const config = testConfig({
      google: { clientId: "", clientSecret: "", redirectUri: "" },
    });
    const google = createGoogleClient(config.google);
    const { app } = buildTestApp({ config, google });

    const response = await app.request("/auth/google");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: "Google OAuth is not configured",
    });
  });
});

describe("GET /auth/google/callback", () => {
  it("sin cookie oauth_state responde 400 y no setea session", async () => {
    const exchangeCode = vi.fn(async () => ({ idToken: "unused" }));
    const { app } = buildTestApp({
      google: fakeGoogle({ exchangeCode }),
    });

    const response = await app.request(
      "/auth/google/callback?code=code-1&state=state-1",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Invalid OAuth state",
    });
    expect(findSetCookie(response, "session")).toBeUndefined();
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("con un state distinto al firmado responde 400", async () => {
    const exchangeCode = vi.fn(async () => ({ idToken: "unused" }));
    const { app } = buildTestApp({
      google: fakeGoogle({ exchangeCode }),
    });
    const signed = await signOAuthState(
      {
        state: "state-a",
        codeVerifier: "verifier-a",
        returnTo: "/dashboard",
      },
      TEST_SECRET,
    );

    const response = await app.request(
      "/auth/google/callback?code=code-1&state=state-b",
      { headers: { cookie: `oauth_state=${signed}` } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Invalid OAuth state",
    });
    expect(findSetCookie(response, "session")).toBeUndefined();
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("con una cookie tampereada responde 400", async () => {
    const { app } = buildTestApp();
    const signed = await signOAuthState(
      {
        state: "state-a",
        codeVerifier: "verifier-a",
        returnTo: "/dashboard",
      },
      TEST_SECRET,
    );

    const response = await app.request(
      "/auth/google/callback?code=code-1&state=state-a",
      { headers: { cookie: `oauth_state=${signed}tampered` } },
    );

    expect(response.status).toBe(400);
    expect(findSetCookie(response, "session")).toBeUndefined();
  });

  it("flujo feliz: exchange con PKCE, link/crea, sesión y redirect", async () => {
    const config = testConfig();
    const tokenRequests: Array<{ input: unknown; init?: RequestInit }> = [];
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      tokenRequests.push({ input, init });
      return new Response(
        JSON.stringify({ id_token: "google-id-token", token_type: "Bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const verifyIdToken = vi.fn(
      async (_idToken: string): Promise<GoogleIdentity> => ({
        subject: "google-subject-1",
        email: "New.User@Example.com",
        emailVerified: true,
      }),
    );
    const google = createGoogleClient(config.google, {
      fetch: fetchImpl,
      verifyIdToken,
    });

    const createUserWithOAuth = vi.fn(
      async (input: CreateUserWithOAuthInput) =>
        fakeUser({
          id: TEST_USER_ID,
          email: input.email,
          username: input.username,
        }),
    );
    const users = happyRepository({ createUserWithOAuth });
    const { app } = buildTestApp({ config, users, google });

    const { stateCookie, state } = await startGoogle(app, "/settings");
    const signedState = await verifyOAuthState(
      cookieValue(stateCookie),
      TEST_SECRET,
    );

    const response = await app.request(
      `/auth/google/callback?code=code-123&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_state=${cookieValue(stateCookie)}` } },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings",
    );

    const sessionCookie = findSetCookie(response, "session");
    expect(sessionCookie).toBeDefined();
    await expect(
      verifySession(cookieValue(sessionCookie!), TEST_SECRET),
    ).resolves.toEqual({ sub: TEST_USER_ID });

    const sessionAttributes = sessionCookie!.toLowerCase();
    expect(sessionAttributes).toContain("httponly");
    expect(sessionAttributes).toContain("path=/");
    expect(sessionAttributes).toContain("max-age=604800");
    expect(sessionAttributes).toContain("samesite=lax");

    const clearedState = findSetCookie(response, "oauth_state");
    expect(clearedState).toBeDefined();
    expect(clearedState!.toLowerCase()).toContain("max-age=0");

    expect(createUserWithOAuth).toHaveBeenCalledWith({
      email: "new.user@example.com",
      username: "new.user",
      provider: "google",
      providerAccountId: "google-subject-1",
      oauthEmail: "new.user@example.com",
    });

    expect(tokenRequests).toHaveLength(1);
    const tokenRequest = tokenRequests[0]!;
    expect(tokenRequest.input).toBe(GOOGLE_TOKEN_ENDPOINT);
    expect(tokenRequest.init?.method).toBe("POST");

    const body = new URLSearchParams(String(tokenRequest.init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-123");
    expect(body.get("code_verifier")).toBe(signedState.codeVerifier);
    expect(body.get("redirect_uri")).toBe(TEST_REDIRECT_URI);
    expect(body.get("client_id")).toBe(TEST_CLIENT_ID);
    expect(body.get("client_secret")).toBe(TEST_CLIENT_SECRET);

    expect(verifyIdToken).toHaveBeenCalledWith("google-id-token");
  });

  it("vincula una cuenta existente por email sin crear ni tocar permisos", async () => {
    const existing = fakeUser({
      id: TEST_USER_ID,
      email: "user@example.com",
      role: "admin",
      username: "boss",
      hashed_password: "hash",
    });
    const linkOAuth = vi.fn(async () => undefined);
    const createUserWithOAuth = vi.fn(
      async (_input: CreateUserWithOAuthInput) => existing,
    );
    const users = happyRepository({
      findByOAuth: async () => null,
      findByEmail: async () => existing,
      linkOAuth,
      createUserWithOAuth,
    });
    const { app } = buildTestApp({ users });

    const { stateCookie, state } = await startGoogle(app);
    const response = await app.request(
      `/auth/google/callback?code=code-1&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_state=${cookieValue(stateCookie)}` } },
    );

    expect(response.status).toBe(302);
    expect(linkOAuth).toHaveBeenCalledWith(existing.id, {
      provider: "google",
      providerAccountId: "google-subject",
      email: "user@example.com",
    });
    expect(createUserWithOAuth).not.toHaveBeenCalled();

    const sessionCookie = findSetCookie(response, "session");
    await expect(
      verifySession(cookieValue(sessionCookie!), TEST_SECRET),
    ).resolves.toEqual({ sub: existing.id });
  });

  it("si ya existe (provider, subject) no busca por email", async () => {
    const linked = fakeUser({ id: TEST_USER_ID });
    const findByEmail = vi.fn(async () => {
      throw new Error("findByEmail should not be called");
    });
    const linkOAuth = vi.fn(async () => undefined);
    const users = happyRepository({
      findByOAuth: async () => linked,
      findByEmail,
      linkOAuth,
    });
    const { app } = buildTestApp({ users });

    const { stateCookie, state } = await startGoogle(app);
    const response = await app.request(
      `/auth/google/callback?code=code-1&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_state=${cookieValue(stateCookie)}` } },
    );

    expect(response.status).toBe(302);
    expect(findByEmail).not.toHaveBeenCalled();
    expect(linkOAuth).not.toHaveBeenCalled();
  });

  it.each([
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
  ])("ignora returnTo inseguro %s y redirige a /dashboard", async (returnTo) => {
    const { app } = buildTestApp({ users: happyRepository() });

    const { stateCookie, state } = await startGoogle(app, returnTo);
    const signedState = await verifyOAuthState(
      cookieValue(stateCookie),
      TEST_SECRET,
    );
    expect(signedState.returnTo).toBe("/dashboard");

    const response = await app.request(
      `/auth/google/callback?code=code-1&state=${encodeURIComponent(state)}`,
      { headers: { cookie: `oauth_state=${cookieValue(stateCookie)}` } },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    );
  });
});

describe("POST /auth/logout", () => {
  it("responde 204 y expira la cookie session", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/auth/logout", { method: "POST" });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");

    const cleared = findSetCookie(response, "session");
    expect(cleared).toBeDefined();
    expect(cleared!.startsWith("session=;")).toBe(true);

    const attributes = cleared!.toLowerCase();
    expect(attributes).toContain("max-age=0");
    expect(attributes).toContain("httponly");
    expect(attributes).toContain("path=/");
    expect(attributes).toContain("samesite=lax");
  });
});
