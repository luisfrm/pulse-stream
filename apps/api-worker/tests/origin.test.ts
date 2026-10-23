/**
 * Gate de `Origin` para métodos mutantes (CSRF).
 *
 * Cubre el caso `SameSite=none` (front y API en dominios distintos): un
 * navegador manda la cookie, pero solo un `Origin` de la allow-list puede
 * mutar estado. No requiere base de datos: el 403 sale antes de tocar nada.
 */

import { describe, expect, it } from "vitest";

import { ORIGIN_NOT_ALLOWED } from "@/middleware/origin";
import { createClient, readJson, testBindings } from "./helpers";

const ALLOWED_ORIGIN_REGEX = "https://app\\.example\\.com";

/** Cliente en `prod` con una allow-list explícita. */
function prodClient() {
  return createClient(
    testBindings({ ENV: "prod", CORS_ORIGIN_REGEX: ALLOWED_ORIGIN_REGEX }),
  );
}

describe("Origin de métodos mutantes", () => {
  it("POST/PUT/PATCH/DELETE con Origin no permitido -> 403", async () => {
    const client = prodClient();

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await client.request("/auth/login", {
        method,
        headers: { origin: "https://evil.example.com" },
      });
      expect(response.status).toBe(403);
      expect(await readJson(response)).toEqual({ detail: ORIGIN_NOT_ALLOWED });
    }
  });

  it("el match es completo (no alcanza con el prefijo)", async () => {
    const client = prodClient();

    const response = await client.request("/auth/login", {
      method: "POST",
      headers: { origin: "https://app.example.com.evil.com" },
    });
    expect(response.status).toBe(403);
  });

  it("sin Origin (curl, SSR, tests) el request sigue", async () => {
    const response = await createClient().postForm("/auth/login", {});
    // Llega a la validación del form (no lo bloquea el gate de Origin).
    expect(response.status).toBe(422);
  });

  it("un Origin permitido sigue al handler", async () => {
    // En local la allow-list es la de loopback (http://localhost:*).
    const response = await createClient().request("/auth/login", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "",
    });
    expect(response.status).toBe(422);
  });

  it("los métodos seguros no se bloquean", async () => {
    const client = prodClient();

    const response = await client.request("/health", {
      method: "GET",
      headers: { origin: "https://evil.example.com" },
    });
    expect(response.status).toBe(200);
  });
});
