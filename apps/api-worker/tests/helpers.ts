/**
 * Helpers de los tests de integración (espejo de `apps/api/tests/helpers.py`).
 *
 * Los tests corren contra una Postgres REAL apuntada por
 * `TEST_DATABASE_URL_WORKER` (o `TEST_DATABASE_URL` como fallback), inyectada
 * por `vitest.config.ts` desde `.dev.vars`. Sin ninguna de las dos los suites
 * se saltean con `describeDb` (nunca se corre contra `DATABASE_URL`).
 *
 * La base del worker es PROPIA: el backend Python usa `TEST_DATABASE_URL` y su
 * `drop_all` no convive con las tablas del rewrite.
 *
 * El cliente envuelve `app.request()` con un cookie jar: la sesión viaja en la
 * cookie HttpOnly `session`, así que cada `Set-Cookie` se guarda y se reenvía
 * igual que lo haría el navegador.
 */

import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";

import { resetAuthCache } from "@/auth/auth";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { createConfig, type AppConfig, type Bindings } from "@/env";
import { app } from "@/index";
import type { UserRead } from "@/schemas";

/** Password de los tests (misma que `apps/api/tests/helpers.py`). */
export const PASSWORD = "Str0ng-Pass!-42";

/** Bindings completos que inyecta `vitest.config.ts` desde `.dev.vars`. */
const env = process.env;

/**
 * URL de la base de tests del WORKER.
 *
 * Preferencia: `TEST_DATABASE_URL_WORKER` (base del rewrite, esquema Drizzle).
 * Fallback: `TEST_DATABASE_URL` (para entornos viejos). NUNCA `DATABASE_URL`.
 */
export const TEST_DATABASE_URL = (
  env.TEST_DATABASE_URL_WORKER ??
  env.TEST_DATABASE_URL ??
  ""
).trim();

export const hasDatabase = TEST_DATABASE_URL.length > 0;

/** `describe` que se saltea (con motivo visible) si no hay base de test. */
export function describeDb(name: string, fn: () => void): void {
  if (!hasDatabase) {
    describe.skip(
      `${name} — omitido: falta TEST_DATABASE_URL_WORKER (o TEST_DATABASE_URL) en .dev.vars`,
      fn,
    );
    return;
  }
  describe(name, fn);
}

/**
 * Bindings del test: los de `.dev.vars` + los overrides que garantizan que
 * NUNCA se toque la base de desarrollo:
 *   - `ENV=local` (cookie host-only, Secure=false, docs on);
 *   - `DATABASE_URL=TEST_DATABASE_URL`;
 *   - `COOKIE_DOMAIN` vacío (host-only);
 *   - rate limiting apagado salvo que el test lo pida explícitamente.
 */
export function testBindings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    ...(env as unknown as Bindings),
    ENV: "local",
    COOKIE_DOMAIN: "",
    DATABASE_URL: TEST_DATABASE_URL,
    RATE_LIMIT_DISABLED: "true",
    ...overrides,
  };
}
export function testConfig(overrides: Partial<Bindings> = {}): AppConfig {
  return createConfig(testBindings(overrides));
}

/**
 * Deja la base de test limpia.
 *
 * `TRUNCATE ... CASCADE` en una sola sentencia (el driver HTTP de Neon no
 * soporta transacciones interactivas): arrastra las FKs. Se listan TODAS las
 * tablas de la app (catálogo incluido) para que un test no vea datos de otro.
 */
export async function resetDb(): Promise<void> {
  // La instancia de better-auth cachea el adapter por DATABASE_URL.
  resetAuthCache();
  await createDb(testConfig()).execute(sql`
    TRUNCATE TABLE
      "artists", "albums", "songs", "song_collaborators",
      "playlists", "playlist_songs",
      "user_favorites", "user_favorite_albums", "user_favorite_playlists",
      "listens",
      "users", "session", "account", "verification", "rate_limit", "rate_limits"
    CASCADE
  `);
}

export interface TestClient {
  readonly cookies: Map<string, string>;
  cookieHeader(): string | undefined;
  clearCookies(): void;
  request(path: string, init?: RequestInit): Promise<Response>;
  get(path: string): Promise<Response>;
  /** `POST` sin body (endpoints de acción, ej. refresh). */
  post(path: string): Promise<Response>;
  del(path: string): Promise<Response>;
  postJson(path: string, body: unknown): Promise<Response>;
  patchJson(path: string, body: unknown): Promise<Response>;
  postForm(path: string, body: Record<string, string>): Promise<Response>;
  /** `multipart/form-data` (import por ZIP). */
  postFormData(path: string, form: FormData): Promise<Response>;
}

/** Subconjunto de la app que usa el cliente (permite `createApp(deps)`). */
export interface RequestApp {
  request(
    input: string,
    init?: RequestInit,
    env?: Bindings,
  ): Promise<Response> | Response;
}

/**
 * Cliente HTTP con cookie jar (simula al navegador).
 *
 * `appInstance` permite apuntar a una app con dependencias inyectadas
 * (`createApp({ storage: fake })`) sin tocar la instancia de producción.
 */
export function createClient(
  bindings: Bindings = testBindings(),
  appInstance: RequestApp = app,
): TestClient {
  const cookies = new Map<string, string>();

  const cookieHeader = (): string | undefined => {
    if (cookies.size === 0) return undefined;
    return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  };

  const request = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    const cookie = cookieHeader();
    if (cookie) headers.set("cookie", cookie);

    const response = await appInstance.request(
      path,
      { ...init, headers },
      bindings,
    );
    storeCookies(response.headers, cookies);
    return response;
  };

  return {
    cookies,
    cookieHeader,
    clearCookies: () => cookies.clear(),
    request,
    get: (path) => request(path, { method: "GET" }),
    post: (path) => request(path, { method: "POST" }),
    del: (path) => request(path, { method: "DELETE" }),
    postJson: (path, body) =>
      request(path, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    patchJson: (path, body) =>
      request(path, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    postForm: (path, body) =>
      request(path, {
        method: "POST",
        body: new URLSearchParams(body).toString(),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    postFormData: (path, form) => request(path, { method: "POST", body: form }),
  };
}

/** Guarda/borra cookies del `Set-Cookie` (respeta `Max-Age=0`). */
function storeCookies(headers: Headers, jar: Map<string, string>): void {
  for (const raw of readSetCookieHeaders(headers)) {
    const separator = raw.indexOf("=");
    if (separator <= 0) continue;
    const name = raw.slice(0, separator).trim();
    const rest = raw.slice(separator + 1);
    const end = rest.indexOf(";");
    const value = (end === -1 ? rest : rest.slice(0, end)).trim();
    const attributes = end === -1 ? "" : rest.slice(end);

    if (value === "" || /max-age=0\b/i.test(attributes)) {
      jar.delete(name);
      continue;
    }
    jar.set(name, value);
  }
}

function readSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") {
    return withGetter.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Email único por test (el username es único en la base compartida). */
export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}@example.com`;
}

export function uniqueUsername(prefix = "usuario"): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

/** `POST /auth/register` (201 esperado por los helpers). */
export async function registerUser(
  client: TestClient,
  options: { email?: string; password?: string; username?: string } = {},
): Promise<UserRead> {
  const response = await client.postJson("/auth/register", {
    email: options.email ?? uniqueEmail(),
    password: options.password ?? PASSWORD,
    ...(options.username ? { username: options.username } : {}),
  });
  if (response.status !== 201) {
    throw new Error(
      `register falló (${response.status}): ${await response.text()}`,
    );
  }
  return readJson<UserRead>(response);
}

/** `POST /auth/login` (form-urlencoded, como `OAuth2PasswordRequestForm`). */
export function login(
  client: TestClient,
  email: string,
  password: string = PASSWORD,
  remember = true,
): Promise<Response> {
  return client.postForm("/auth/login", {
    username: email,
    password,
    remember: String(remember),
  });
}

/** Registra + loguea; `admin: true` promueve por DB (como el fixture Python). */
export async function registerAndLogin(
  client: TestClient,
  options: { admin?: boolean; username?: string } = {},
): Promise<UserRead> {
  const user = await registerUser(client, { username: options.username });
  const response = await login(client, user.email);
  if (response.status !== 204) {
    throw new Error(
      `login falló (${response.status}): ${await response.text()}`,
    );
  }
  if (options.admin) await promoteToAdmin(user.email);
  return user;
}

/** Promoción directa en la DB (no hay endpoint público para el primer admin). */
export async function promoteToAdmin(email: string): Promise<void> {
  await createDb(testConfig())
    .update(users)
    .set({ role: "admin", isSuperuser: true })
    .where(eq(users.email, email));
}

/** Deja al usuario inactivo (`is_active=false` -> 401 en `current_user`). */
export async function deactivateUser(email: string): Promise<void> {
  await createDb(testConfig())
    .update(users)
    .set({ isActive: false })
    .where(eq(users.email, email));
}

/** Cuenta filas de una tabla (`session`, `account`, ...). */
export async function countRows(table: string): Promise<number> {
  const result = await createDb(testConfig()).execute(
    sql.raw(`SELECT count(*)::int AS count FROM "${table}"`),
  );
  const rows = Array.isArray(result)
    ? result
    : (result as { rows?: unknown[] }).rows ?? [];
  const first = rows[0] as { count?: number | string } | undefined;
  return Number(first?.count ?? 0);
}
