/**
 * Higiene de sesiones: una sesión VENCIDA se rechaza con 401.
 *
 * better-auth deja la fila en `session` hasta que algo la borra; el
 * middleware de auth limpia sesiones/verificaciones vencidas de forma
 * oportunista (fire-and-forget, una vez cada 5 minutos). Lo que NO puede pasar
 * es que una sesión vencida siga autenticando.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { session } from "@/db/schema";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  testConfig,
  type TestClient,
} from "./helpers";

describeDb("session expiry", () => {
  let client: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient();
  });

  it("una fila de `session` vencida no autentica (401)", async () => {
    const user = await registerAndLogin(client);

    // La sesión sigue existiendo, pero con `expires_at` en el pasado.
    await createDb(testConfig())
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(session.userId, user.id));

    const me = await client.get("/users/me");
    expect(me.status).toBe(401);
    expect(await readJson(me)).toEqual({ detail: "Unauthorized" });

    // Cualquier endpoint autenticado, no solo /users/me.
    expect((await client.get("/me/playlists")).status).toBe(401);
    expect((await client.get("/me/favorites")).status).toBe(401);
  });
});
