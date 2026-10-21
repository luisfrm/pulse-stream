import { describe, expect, it } from "vitest";

import { verifySession } from "../src/auth/session";
import type { UserRecord } from "../src/features/users/repository";
import {
  TEST_SECRET,
  TEST_USER_ID,
  buildTestApp,
  cookieValue,
  fakeRepository,
  fakeUser,
  findSetCookie,
} from "./helpers";

/** Hash argon2id real generado por `pwdlib.PasswordHash.recommended()`. */
const HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$yNO3ZkOurf6RDS4kZsbiSw$s+mVXIQPMq/bwiCHA6MwhYZ83kZxFBDP4WHMHtN07Ac";
const PASSWORD = "Password-123!";

function loginApp(user: UserRecord | null = fakeUser({ hashed_password: HASH })) {
  const users = fakeRepository({
    findByIdentifier: async (identifier) => {
      if (!user) return null;
      const matches =
        identifier.toLowerCase() === user.email.toLowerCase() ||
        (user.username !== null &&
          identifier.toLowerCase() === user.username.toLowerCase());
      return matches ? user : null;
    },
  });

  return buildTestApp({ users });
}

function loginRequest(identifier = "user@example.com", password = PASSWORD) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  };
}

describe("POST /auth/login (email/usuario + password)", () => {
  it("email + password correctos → 204 y cookie session válida", async () => {
    const { app } = loginApp();

    const response = await app.request("/auth/login", loginRequest());

    expect(response.status).toBe(204);
    const cookie = findSetCookie(response, "session");
    expect(cookie).toBeDefined();
    await expect(
      verifySession(cookieValue(cookie!), TEST_SECRET),
    ).resolves.toEqual({ sub: TEST_USER_ID });
  });

  it("username + password correctos → 204", async () => {
    const { app } = loginApp();

    const response = await app.request(
      "/auth/login",
      loginRequest("USER"),
    );

    expect(response.status).toBe(204);
    expect(findSetCookie(response, "session")).toBeDefined();
  });

  it("password incorrecta → 400 sin cookie", async () => {
    const { app } = loginApp();

    const response = await app.request(
      "/auth/login",
      loginRequest("user@example.com", "wrong-password"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Credenciales inválidas",
    });
    expect(findSetCookie(response, "session")).toBeUndefined();
  });

  it("identifier inexistente → 400", async () => {
    const { app } = loginApp();

    const response = await app.request(
      "/auth/login",
      loginRequest("nadie@example.com"),
    );

    expect(response.status).toBe(400);
  });

  it("usuario sin password (hash NULL) → 400", async () => {
    const { app } = loginApp(
      fakeUser({ hashed_password: null, is_verified: true }),
    );

    const response = await app.request("/auth/login", loginRequest());

    expect(response.status).toBe(400);
  });

  it("usuario inactivo → 400", async () => {
    const { app } = loginApp(
      fakeUser({ hashed_password: HASH, is_active: false }),
    );

    const response = await app.request("/auth/login", loginRequest());

    expect(response.status).toBe(400);
  });

  it("body inválido → 400 {detail:'Invalid request'}", async () => {
    const { app } = loginApp();

    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "user@example.com" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Invalid request",
    });
  });
});
