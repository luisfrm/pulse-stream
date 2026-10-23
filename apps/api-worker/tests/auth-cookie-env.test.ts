/**
 * Cookie de sesión fuera de local (ENV=prod / ENV=dev).
 *
 * Regresión del bug crítico: better-auth prefija el nombre con `__Secure-`
 * cuando `advanced.useSecureCookies` es true, así que emitía
 * `__Secure-session` mientras el guard del web (`apps/web/proxy.ts`) y este
 * worker leen `session`. Resultado: login 500 (no encontraba su cookie) y 401
 * en toda request autenticada. El flujo completo se corre acá con el `ENV`
 * real para que un cambio en esa config rompa el test.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { UserRead } from "@/schemas";
import {
  createClient,
  describeDb,
  login,
  readJson,
  registerUser,
  resetDb,
  testBindings,
} from "./helpers";

/** `Set-Cookie` de la cookie de sesión (`undefined` si no vino). */
function sessionSetCookie(response: Response): string | undefined {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const all =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];

  return all.find((header) => header.startsWith("session="));
}

describeDb("cookie de sesión fuera de local", () => {
  beforeEach(async () => {
    await resetDb();
  });

  for (const environment of ["prod", "dev"] as const) {
    it(`ENV=${environment}: register -> login -> /users/me -> logout`, async () => {
      const client = createClient(testBindings({ ENV: environment }));

      const user = await registerUser(client);

      const loginResponse = await login(client, user.email);
      expect(loginResponse.status).toBe(204);

      const cookie = sessionSetCookie(loginResponse);
      expect(cookie).toBeDefined();
      // El NOMBRE no lleva `__Secure-`: el guard del web busca `session`.
      expect(cookie?.startsWith("session=")).toBe(true);
      // El atributo Secure sí se emite (https en dev/prod).
      expect(cookie).toContain("Secure");

      const me = await client.get("/users/me");
      expect(me.status).toBe(200);
      expect((await readJson<UserRead>(me)).id).toBe(user.id);

      const logout = await client.request("/auth/logout", { method: "POST" });
      expect(logout.status).toBe(204);

      expect((await client.get("/users/me")).status).toBe(401);
    });
  }
});
