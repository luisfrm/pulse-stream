/**
 * Integración de `/auth/*` (espejo de `apps/api/tests/test_auth.py`).
 *
 * Requiere `TEST_DATABASE_URL`; sin ella el suite se saltea con un mensaje
 * explícito (nunca corre contra `DATABASE_URL`).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  PASSWORD,
  countRows,
  createClient,
  deactivateUser,
  describeDb,
  login,
  readJson,
  registerUser,
  resetDb,
  testBindings,
  uniqueEmail,
  type TestClient,
} from "./helpers";

describeDb("auth", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("register -> login -> /users/me -> logout (flujo completo)", async () => {
    const email = uniqueEmail();

    // Registro: usuario normal (role null) y sin datos sensibles.
    const created = await registerUser(client, { email });
    expect(created.email).toBe(email);
    expect(created.role).toBeNull();
    expect(created.is_superuser).toBe(false);
    expect(created.is_active).toBe(true);
    expect(created.username).toBeNull();
    expect(created.total_plays).toBe(0);
    expect(created).not.toHaveProperty("hashed_password");

    // El registro NO inicia sesión (ni deja sesiones colgadas en la DB).
    expect(client.cookies.has("session")).toBe(false);
    expect(await countRows("session")).toBe(0);

    // Login: 204 + cookie `session` HttpOnly persistente.
    const logged = await login(client, email);
    expect(logged.status).toBe(204);
    expect(await logged.text()).toBe("");

    const setCookies = logged.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("session=");
    expect(setCookies[0]).toContain("HttpOnly");
    expect(setCookies[0]).toContain("SameSite=Lax");
    expect(setCookies[0]).toContain("Max-Age=604800");
    expect(client.cookies.has("session")).toBe(true);

    // /users/me con la cookie.
    const me = await client.get("/users/me");
    expect(me.status).toBe(200);
    expect((await readJson<{ email: string }>(me)).email).toBe(email);

    // Logout: 204 + cookie expirada; la sesión de la DB se borró.
    const loggedOut = await client.request("/auth/logout", { method: "POST" });
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers.getSetCookie()[0]).toContain("Max-Age=0");
    expect(client.cookies.has("session")).toBe(false);
    expect(await countRows("session")).toBe(0);

    // Sin cookie ya no hay sesión.
    const afterLogout = await client.get("/users/me");
    expect(afterLogout.status).toBe(401);
    expect(await readJson(afterLogout)).toEqual({ detail: "Unauthorized" });
  });

  it("remember=false emite una cookie de sesión (sin Max-Age)", async () => {
    const user = await registerUser(client);

    const response = await login(client, user.email, PASSWORD, false);
    expect(response.status).toBe(204);

    const cookie = response.headers.getSetCookie()[0] ?? "";
    expect(cookie).toContain("session=");
    expect(cookie).not.toContain("Max-Age");
    // La sesión del servidor sigue viva: la diferencia es solo del navegador.
    expect((await client.get("/users/me")).status).toBe(200);
  });

  it("login con password incorrecta -> 400 LOGIN_BAD_CREDENTIALS", async () => {
    const user = await registerUser(client);

    const response = await login(client, user.email, "wrong-password");
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "LOGIN_BAD_CREDENTIALS",
    });
    expect(client.cookies.has("session")).toBe(false);
    expect(await countRows("session")).toBe(0);
  });

  it("login con email inexistente -> 400 LOGIN_BAD_CREDENTIALS", async () => {
    const response = await login(client, uniqueEmail("nadie"));
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "LOGIN_BAD_CREDENTIALS",
    });
  });

  it("login de un usuario inactivo -> 400 y sin sesión persistida", async () => {
    const user = await registerUser(client);
    await deactivateUser(user.email);

    const response = await login(client, user.email);
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "LOGIN_BAD_CREDENTIALS",
    });
    // Compensación: better-auth SÍ creó la sesión, el service la borra.
    expect(await countRows("session")).toBe(0);
    expect(client.cookies.has("session")).toBe(false);
  });

  it("register duplicado -> 400 REGISTER_USER_ALREADY_EXISTS", async () => {
    const email = uniqueEmail();
    await registerUser(client, { email });

    const response = await client.postJson("/auth/register", {
      email,
      password: PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "REGISTER_USER_ALREADY_EXISTS",
    });
  });

  it("register con password corta -> 400 REGISTER_INVALID_PASSWORD", async () => {
    // Desvío documentado: Python no validaba largo (fastapi-users sin
    // password_helper); better-auth exige el mínimo de 8.
    const response = await client.postJson("/auth/register", {
      email: uniqueEmail(),
      password: "corta",
    });
    expect(response.status).toBe(400);

    const body = await readJson<{
      detail: { code: string; reason: string };
    }>(response);
    expect(body.detail.code).toBe("REGISTER_INVALID_PASSWORD");
    expect(body.detail.reason).toContain("8");
  });

  it("register con email inválido -> 422 con el shape de FastAPI", async () => {
    const response = await client.postJson("/auth/register", {
      email: "no-es-un-email",
      password: PASSWORD,
    });
    expect(response.status).toBe(422);

    const body = await readJson<{
      detail: Array<{ loc: Array<string | number>; msg: string }>;
    }>(response);
    expect(body.detail[0]?.loc).toEqual(["body", "email"]);
  });

  it("login sin `username` -> 422 (form de OAuth2)", async () => {
    const response = await client.postForm("/auth/login", {
      password: PASSWORD,
    });
    expect(response.status).toBe(422);

    const body = await readJson<{
      detail: Array<{ loc: Array<string | number> }>;
    }>(response);
    expect(body.detail[0]?.loc).toEqual(["body", "username"]);
  });

  it("logout sin sesión -> 401", async () => {
    const response = await client.request("/auth/logout", { method: "POST" });
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ detail: "Unauthorized" });
  });

  it("/users/me sin cookie -> 401", async () => {
    const response = await client.get("/users/me");
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ detail: "Unauthorized" });
  });

  it("forgot-password responde 202 siempre (no revela si el email existe)", async () => {
    const user = await registerUser(client);

    for (const email of [user.email, uniqueEmail("desconocido")]) {
      const response = await client.postJson("/auth/forgot-password", { email });
      expect(response.status).toBe(202);
      expect(await response.text()).toBe("null");
    }
  });

  it("request-verify-token responde 202 siempre", async () => {
    const user = await registerUser(client);

    for (const email of [user.email, uniqueEmail("desconocido")]) {
      const response = await client.postJson("/auth/request-verify-token", {
        email,
      });
      expect(response.status).toBe(202);
      expect(await response.text()).toBe("null");
    }
  });

  it("reset-password con token inválido -> 400 RESET_PASSWORD_BAD_TOKEN", async () => {
    const response = await client.postJson("/auth/reset-password", {
      token: "token-invalido",
      password: PASSWORD,
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "RESET_PASSWORD_BAD_TOKEN",
    });
  });

  it("verify con token inválido -> 400 VERIFY_USER_BAD_TOKEN", async () => {
    const response = await client.postJson("/auth/verify", {
      token: "token-invalido",
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "VERIFY_USER_BAD_TOKEN",
    });
  });
});

describeDb("auth: rate limiting", () => {
  beforeEach(resetDb);

  it("el 6º login en la misma ventana -> 429 con el detail de slowapi", async () => {
    // Rate limiting activo SOLO en este suite (`ENV=local`, no prod).
    const client = createClient(testBindings({ RATE_LIMIT_DISABLED: "false" }));
    const ip = { "x-forwarded-for": "203.0.113.9" };
    const attempt = () =>
      client.request("/auth/login", {
        method: "POST",
        body: new URLSearchParams({
          username: uniqueEmail("nadie"),
          password: PASSWORD,
        }).toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...ip,
        },
      });

    for (let index = 0; index < 5; index += 1) {
      const response = await attempt();
      expect(response.status).toBe(400);
    }

    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(await readJson(limited)).toEqual({
      detail: "Demasiados intentos. Intentá de nuevo más tarde.",
    });
  });

  it("otra IP no hereda el contador", async () => {
    const client = createClient(testBindings({ RATE_LIMIT_DISABLED: "false" }));
    const attempt = (forwarded: string) =>
      client.request("/auth/login", {
        method: "POST",
        body: new URLSearchParams({
          username: uniqueEmail("nadie"),
          password: PASSWORD,
        }).toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": forwarded,
        },
      });

    for (let index = 0; index < 5; index += 1) {
      expect((await attempt("198.51.100.1")).status).toBe(400);
    }
    expect((await attempt("198.51.100.1")).status).toBe(429);
    expect((await attempt("198.51.100.2")).status).toBe(400);
  });

  it("RATE_LIMIT_DISABLED se ignora en prod", async () => {
    const client = createClient(
      testBindings({ ENV: "prod", RATE_LIMIT_DISABLED: "true" }),
    );

    for (let index = 0; index < 5; index += 1) {
      const response = await client.request("/auth/login", {
        method: "POST",
        body: new URLSearchParams({
          username: uniqueEmail("nadie"),
          password: PASSWORD,
        }).toString(),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "192.0.2.7",
        },
      });
      expect(response.status).toBe(400);
    }

    const limited = await client.request("/auth/login", {
      method: "POST",
      body: new URLSearchParams({
        username: uniqueEmail("nadie"),
        password: PASSWORD,
      }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "192.0.2.7",
      },
    });
    expect(limited.status).toBe(429);
  });
});

describe("auth: contrato de errores sin DB", () => {
  it("un body JSON inválido no se confunde con 401", async () => {
    const client = createClient();
    const response = await client.postJson("/auth/forgot-password", {
      email: 42,
    });
    // 422 de validación antes de tocar la DB (no requiere TEST_DATABASE_URL).
    expect(response.status).toBe(422);
    expect(await readJson<{ detail: unknown[] }>(response)).toHaveProperty(
      "detail",
    );
  });
});
