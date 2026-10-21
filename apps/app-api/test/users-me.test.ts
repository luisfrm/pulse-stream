import { describe, expect, it } from "vitest";

import { signSession } from "../src/auth/session";
import {
  TEST_SECRET,
  TEST_USER_ID,
  buildTestApp,
  fakeRepository,
  fakeUser,
  testConfig,
} from "./helpers";

const USER_READ_KEYS = [
  "id",
  "email",
  "is_active",
  "is_verified",
  "is_superuser",
  "role",
  "username",
  "cover_key",
  "cover_url",
  "total_plays",
];

describe("GET /users/me", () => {
  it("sin cookie responde 401 {detail}", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/users/me");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: "Unauthorized",
    });
  });

  it("con una cookie inválida responde 401", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/users/me", {
      headers: { cookie: "session=not-a-jwt" },
    });

    expect(response.status).toBe(401);
  });

  it("con JWT válido + repo fake responde el shape exacto de UserRead", async () => {
    const user = fakeUser({
      role: "admin",
      is_superuser: true,
      username: "boss",
      cover_key: "covers/abc.webp",
      total_plays: 42,
    });
    const config = testConfig({
      r2PublicBaseUrl: "https://cdn.example.com/",
    });
    const users = fakeRepository({
      getById: async (id) => (id === user.id ? user : null),
    });
    const { app } = buildTestApp({ config, users });
    const token = await signSession(user.id, TEST_SECRET);

    const response = await app.request("/users/me", {
      headers: { cookie: `session=${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toEqual({
      id: user.id,
      email: "user@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: true,
      role: "admin",
      username: "boss",
      cover_key: "covers/abc.webp",
      cover_url: "https://cdn.example.com/covers/abc.webp",
      total_plays: 42,
    });
    expect(Object.keys(body)).toEqual(USER_READ_KEYS);
  });

  it("normaliza role legacy a null y cover_url vacío a null", async () => {
    const user = fakeUser({ role: "user", cover_key: "covers/x.webp" });
    const users = fakeRepository({ getById: async () => user });
    const { app } = buildTestApp({ users });
    const token = await signSession(user.id, TEST_SECRET);

    const response = await app.request("/users/me", {
      headers: { cookie: `session=${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.role).toBeNull();
    expect(body.cover_key).toBe("covers/x.webp");
    expect(body.cover_url).toBeNull();
  });

  it("con un usuario inexistente responde 401", async () => {
    const users = fakeRepository({ getById: async () => null });
    const { app } = buildTestApp({ users });
    const token = await signSession(TEST_USER_ID, TEST_SECRET);

    const response = await app.request("/users/me", {
      headers: { cookie: `session=${token}` },
    });

    expect(response.status).toBe(401);
  });

  it("con un usuario inactivo responde 401", async () => {
    const user = fakeUser({ is_active: false });
    const users = fakeRepository({ getById: async () => user });
    const { app } = buildTestApp({ users });
    const token = await signSession(user.id, TEST_SECRET);

    const response = await app.request("/users/me", {
      headers: { cookie: `session=${token}` },
    });

    expect(response.status).toBe(401);
  });

  it("aplica CORS con credenciales solo a orígenes permitidos", async () => {
    const { app } = buildTestApp();
    const token = await signSession(TEST_USER_ID, TEST_SECRET);
    const users = fakeRepository({ getById: async () => fakeUser() });
    const allowed = buildTestApp({ users });

    const response = await allowed.app.request("/users/me", {
      headers: {
        cookie: `session=${token}`,
        origin: "http://localhost:3000",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );

    const denied = await app.request("/users/me", {
      headers: { origin: "https://evil.example" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    // CORS también sobre respuestas de error (el catch vive dentro de cors).
    const unauthorized = await allowed.app.request("/users/me", {
      headers: { origin: "http://localhost:3000" },
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
  });
});
