/**
 * Integración de `/users/me` (espejo de `apps/api/tests/test_users_profile.py`).
 *
 * Incluye el test de regresión de escalada de privilegios: `PATCH /users/me`
 * con `role`/`is_superuser`/`is_active`/`is_verified` NO debe cambiarlos (en el
 * backend Python `UserUpdate` los aceptaba).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  PASSWORD,
  createClient,
  describeDb,
  login,
  readJson,
  registerAndLogin,
  registerUser,
  resetDb,
  uniqueEmail,
  uniqueUsername,
  type TestClient,
} from "./helpers";
import type { UserRead } from "@/schemas";

const PROFILE_KEY = "covers/44444444-4444-4444-8444-444444444444.webp";

describeDb("users/me", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("registro con username lo preserva tal cual (case-sensitive)", async () => {
    const username = `DJ_Shadow-${crypto.randomUUID().slice(0, 8)}`;

    const user = await registerUser(client, { username });
    expect(user.username).toBe(username);

    const me = await client.get("/users/me");
    expect(me.status).toBe(401);

    await login(client, user.email);
    const body = await readJson<UserRead>(await client.get("/users/me"));
    expect(body.username).toBe(username);
  });

  it("username duplicado (case-insensitive) -> 400", async () => {
    const username = uniqueUsername("dupe");
    await registerUser(client, { username });

    const response = await client.postJson("/auth/register", {
      email: uniqueEmail(),
      password: PASSWORD,
      username: username.toUpperCase(),
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "REGISTER_USER_ALREADY_EXISTS",
    });
  });

  it("username inválido -> 422 (mínimo 2 y solo letras/números/._-)", async () => {
    for (const username of ["a", "con barra/", "emoji🙂"]) {
      const response = await client.postJson("/auth/register", {
        email: uniqueEmail(),
        password: PASSWORD,
        username,
      });
      expect(response.status).toBe(422);
    }
  });

  it("PATCH /users/me actualiza username y cover_key", async () => {
    const user = await registerAndLogin(client);
    expect(user.username).toBeNull();

    const username = uniqueUsername("nuevo");
    const patched = await client.patchJson("/users/me", {
      username,
      cover_key: PROFILE_KEY,
    });
    expect(patched.status).toBe(200);

    const body = await readJson<UserRead>(patched);
    expect(body.username).toBe(username);
    expect(body.cover_key).toBe(PROFILE_KEY);
    expect(body.cover_url).toContain(PROFILE_KEY);
    expect(body.total_plays).toBe(0);

    const me = await readJson<UserRead>(await client.get("/users/me"));
    expect(me.username).toBe(username);
    expect(me.cover_key).toBe(PROFILE_KEY);
  });

  it("cover_key fuera del patrón del presign -> 422", async () => {
    await registerAndLogin(client);

    const response = await client.patchJson("/users/me", {
      cover_key: "https://evil.example.com/cover.webp",
    });
    expect(response.status).toBe(422);
  });

  it("username tomado por otro usuario -> 400 UPDATE_USER_EMAIL_ALREADY_EXISTS", async () => {
    const taken = uniqueUsername("tomado");
    const first = await registerAndLogin(client);
    await client.patchJson("/users/me", { username: taken });

    // Segundo usuario (el jar mantiene la cookie del primero).
    const other = createClient();
    await registerAndLogin(other);

    const response = await other.patchJson("/users/me", {
      username: taken.toUpperCase(),
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "UPDATE_USER_EMAIL_ALREADY_EXISTS",
    });

    // El primero conserva su username.
    const me = await readJson<UserRead>(await client.get("/users/me"));
    expect(me.email).toBe(first.email);
    expect(me.username).toBe(taken);
  });

  it("email tomado por otro usuario -> 400", async () => {
    const first = await registerAndLogin(client);
    const other = createClient();
    await registerAndLogin(other);

    const response = await other.patchJson("/users/me", {
      email: first.email,
    });
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      detail: "UPDATE_USER_EMAIL_ALREADY_EXISTS",
    });
  });

  it("PATCH /users/me ignora los campos de privilegio (regresión)", async () => {
    await registerAndLogin(client);

    const response = await client.patchJson("/users/me", {
      role: "admin",
      is_superuser: true,
      is_active: false,
      is_verified: true,
    });
    expect(response.status).toBe(200);

    const body = await readJson<UserRead>(response);
    expect(body.role).toBeNull();
    expect(body.is_superuser).toBe(false);
    expect(body.is_active).toBe(true);
    expect(body.is_verified).toBe(false);

    // Sigue sin acceso al panel.
    expect((await client.get("/admin/users")).status).toBe(403);
  });

  it("PATCH /users/me con password corta -> 400 UPDATE_USER_INVALID_PASSWORD", async () => {
    await registerAndLogin(client);

    const response = await client.patchJson("/users/me", { password: "corta" });
    expect(response.status).toBe(400);

    const body = await readJson<{
      detail: { code: string; reason: string };
    }>(response);
    expect(body.detail.code).toBe("UPDATE_USER_INVALID_PASSWORD");
    expect(body.detail.reason).toContain("8");
  });

  it("PATCH /users/me cambia la password y el login usa la nueva", async () => {
    const user = await registerAndLogin(client);
    const newPassword = "Otra-Pass!-99";

    const response = await client.patchJson("/users/me", {
      password: newPassword,
    });
    expect(response.status).toBe(200);

    const withOldPassword = await login(createClient(), user.email);
    expect(withOldPassword.status).toBe(400);

    const fresh = createClient();
    expect((await login(fresh, user.email, newPassword)).status).toBe(204);
    expect((await fresh.get("/users/me")).status).toBe(200);
  });

  it("PATCH /users/me con body vacío devuelve el usuario sin cambios", async () => {
    const user = await registerAndLogin(client);

    const response = await client.patchJson("/users/me", {});
    expect(response.status).toBe(200);

    const body = await readJson<UserRead>(response);
    expect(body.id).toBe(user.id);
    expect(body.email).toBe(user.email);
  });
});
