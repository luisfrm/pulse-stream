import { describe, expect, it } from "vitest";

import { buildTestApp } from "./helpers";

describe("GET /health", () => {
  it("responde 200 {status:'ok'}", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("expone el OpenAPI 3.1 con las rutas de Fase 0", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/openapi.json");
    expect(response.status).toBe(200);

    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths).sort()).toEqual([
      "/auth/google",
      "/auth/google/callback",
      "/auth/logout",
      "/health",
      "/users/me",
    ]);
    expect(document.components?.securitySchemes).toHaveProperty(
      "sessionCookie",
    );
  });

  it("devuelve 404 {detail} en rutas desconocidas", async () => {
    const { app } = buildTestApp();

    const response = await app.request("/nope");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ detail: "Not Found" });
  });
});
