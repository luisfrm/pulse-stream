/**
 * Integración de `/admin/users` y `/users/{id}`
 * (espejo de `apps/api/tests/test_users_admin.py`).
 *
 * `require_admin` = `role=admin` o `is_superuser` (403 con el detail español);
 * `/users/{id}` exige superusuario (403 "Forbidden").
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createClient,
  describeDb,
  login,
  readJson,
  registerAndLogin,
  registerUser,
  resetDb,
  uniqueUsername,
  type TestClient,
} from "./helpers";
import type { UserRead } from "@/schemas";

const ADMIN_REQUIRED = "Requiere permisos de administrador";

describeDb("admin/users", () => {
  let client: TestClient;
  let admin: UserRead;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
    admin = await registerAndLogin(client, { admin: true });
  });

  it("sin sesión -> 401; usuario normal -> 403", async () => {
    const anonymous = await createClient().get("/admin/users");
    expect(anonymous.status).toBe(401);
    expect(await readJson(anonymous)).toEqual({ detail: "Unauthorized" });

    const normal = createClient();
    await registerAndLogin(normal);

    const forbidden = await normal.get("/admin/users");
    expect(forbidden.status).toBe(403);
    expect(await readJson(forbidden)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("lista usuarios (array pelado, orden created_at desc)", async () => {
    const older = await registerUser(client);
    const newer = await registerUser(client);

    const response = await client.get("/admin/users");
    expect(response.status).toBe(200);

    const users = await readJson<UserRead[]>(response);
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(3);
    expect(users.every((user) => user.role === null || user.role === "admin")).toBe(
      true,
    );
    // El último registrado aparece primero.
    expect(users[0]?.id).toBe(newer.id);
    expect(users.map((user) => user.id)).toEqual(
      expect.arrayContaining([admin.id, older.id, newer.id]),
    );
  });

  it("respeta offset/limit y valida el rango", async () => {
    await registerUser(client);

    const page = await client.get("/admin/users?offset=1&limit=1");
    expect(page.status).toBe(200);
    expect((await readJson<UserRead[]>(page)).length).toBe(1);

    for (const query of ["limit=0", "limit=101", "offset=-1"]) {
      const invalid = await client.get(`/admin/users?${query}`);
      expect(invalid.status).toBe(422);
    }
  });

  it("un admin no puede borrarse a sí mismo", async () => {
    const response = await client.del(`/admin/users/${admin.id}`);
    expect(response.status).toBe(400);
    expect(await readJson<{ detail: string }>(response)).toEqual({
      detail: "Un admin no puede borrar su propia cuenta",
    });
  });

  it("un admin borra a otro usuario (y ese usuario ya no puede loguear)", async () => {
    const victim = await registerUser(client);

    const response = await client.del(`/admin/users/${victim.id}`);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    const loginAttempt = await login(createClient(), victim.email);
    expect(loginAttempt.status).toBe(400);

    const users = await readJson<UserRead[]>(await client.get("/admin/users"));
    expect(users.some((user) => user.id === victim.id)).toBe(false);
  });

  it("borrar un usuario inexistente -> 404", async () => {
    const missing = crypto.randomUUID();

    const response = await client.del(`/admin/users/${missing}`);
    expect(response.status).toBe(404);
    expect(await readJson<{ detail: string }>(response)).toEqual({
      detail: `Usuario ${missing} no existe`,
    });
  });

  it("`user_id` no-uuid -> 422 (el path es uuid en el contrato)", async () => {
    const response = await client.del("/admin/users/no-es-uuid");
    expect(response.status).toBe(422);
  });

  it("un usuario normal no puede asignar roles", async () => {
    const normal = createClient();
    await registerAndLogin(normal);
    const victim = await registerUser(client);

    const response = await normal.patchJson(
      `/admin/users/${victim.id}/role`,
      { role: "admin" },
    );
    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ detail: ADMIN_REQUIRED });
  });

  it("un admin promueve y revoca el rol", async () => {
    const victim = await registerUser(client);
    expect(victim.role).toBeNull();

    const promoted = await client.patchJson(`/admin/users/${victim.id}/role`, {
      role: "admin",
    });
    expect(promoted.status).toBe(200);
    expect((await readJson<UserRead>(promoted)).role).toBe("admin");

    const revoked = await client.patchJson(`/admin/users/${victim.id}/role`, {
      role: null,
    });
    expect(revoked.status).toBe(200);
    expect((await readJson<UserRead>(revoked)).role).toBeNull();
  });

  it("un admin no puede quitarse su propio rol", async () => {
    const response = await client.patchJson(`/admin/users/${admin.id}/role`, {
      role: null,
    });
    expect(response.status).toBe(400);
    expect(await readJson<{ detail: string }>(response)).toEqual({
      detail: "Un admin no puede quitarse su propio rol",
    });
  });

  it("`role` es requerido y solo acepta admin|null", async () => {
    const victim = await registerUser(client);

    for (const body of [{}, { role: "superadmin" }, { role: "ADMIN" }]) {
      const response = await client.patchJson(
        `/admin/users/${victim.id}/role`,
        body,
      );
      expect(response.status).toBe(422);
    }
  });

  it("set role de un usuario inexistente -> 404", async () => {
    const missing = crypto.randomUUID();

    const response = await client.patchJson(`/admin/users/${missing}/role`, {
      role: "admin",
    });
    expect(response.status).toBe(404);
    expect(await readJson<{ detail: string }>(response)).toEqual({
      detail: `Usuario ${missing} no existe`,
    });
  });
});

describeDb("users/{id} (superusuario)", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
    await registerAndLogin(client, { admin: true });
  });

  it("un usuario normal recibe 403 Forbidden", async () => {
    const normal = createClient();
    await registerAndLogin(normal);
    const victim = await registerUser(client);

    const response = await normal.get(`/users/${victim.id}`);
    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ detail: "Forbidden" });
  });

  it("el superusuario lee y edita a otro usuario", async () => {
    const victim = await registerUser(client);

    const read = await client.get(`/users/${victim.id}`);
    expect(read.status).toBe(200);
    expect((await readJson<UserRead>(read)).email).toBe(victim.email);

    const username = uniqueUsername("editado");
    const patched = await client.patchJson(`/users/${victim.id}`, { username });
    expect(patched.status).toBe(200);
    expect((await readJson<UserRead>(patched)).username).toBe(username);
  });

  it("un id inexistente o no-uuid -> 404 Not Found (fastapi-users)", async () => {
    for (const id of [crypto.randomUUID(), "no-es-uuid"]) {
      const response = await client.get(`/users/${id}`);
      expect(response.status).toBe(404);
      expect(await readJson(response)).toEqual({ detail: "Not Found" });
    }
  });

  it("acepta las formas de id que acepta uuid.UUID()", async () => {
    const victim = await registerUser(client);
    const forms = [
      victim.id,
      victim.id.replace(/-/g, ""),
      `{${victim.id}}`,
      `urn:uuid:${victim.id}`,
      victim.id.toUpperCase(),
    ];

    for (const id of forms) {
      const response = await client.get(`/users/${encodeURIComponent(id)}`);
      expect(response.status).toBe(200);
      expect((await readJson<UserRead>(response)).id).toBe(victim.id);
    }
  });

  it("el superusuario borra a otro usuario", async () => {
    const victim = await registerUser(client);

    const response = await client.del(`/users/${victim.id}`);
    expect(response.status).toBe(204);

    expect((await client.get(`/users/${victim.id}`)).status).toBe(404);
    expect((await login(createClient(), victim.email)).status).toBe(400);
  });
});
