/**
 * Smoke tests del scaffold: /health, /openapi.json y el contrato de errores.
 *
 * La forma de `components.schemas` se verifica en `lib/contract.test.ts`
 * (gate de paridad contra el OpenAPI de Pydantic).
 */

import { describe, expect, it } from "vitest";

import type { Bindings } from "@/env";
import { app } from "@/index";

const env: Bindings = {
  ENV: "local",
  AUTH_SECRET: "test-secret",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/pulse",
  R2_PUBLIC_BASE_URL: "https://cdn.example.com/",
  SESSION_COOKIE_NAME: "session",
};

describe("GET /health", () => {
  it("devuelve 200 {status:ok}", async () => {
    const res = await app.request("/health", undefined, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("responde sin ningún secreto configurado", async () => {
    const res = await app.request("/health", undefined, {} as Bindings);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /openapi.json", () => {
  it("expone OpenAPI 3.1 con los metadatos de FastAPI", async () => {
    const res = await app.request("/openapi.json", undefined, env);
    expect(res.status).toBe(200);

    const doc = (await res.json()) as {
      openapi: string;
      info: { title: string; version: string };
      components: { schemas: Record<string, unknown> };
    };

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info).toEqual({ title: "Pulse Stream API", version: "0.1.0" });
    expect(Object.keys(doc.components.schemas)).not.toHaveLength(0);
  });

  it("no expone docs fuera de local", async () => {
    const prodEnv: Bindings = { ...env, ENV: "prod" };

    const res = await app.request("/openapi.json", undefined, prodEnv);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not Found" });

    const docs = await app.request("/docs", undefined, prodEnv);
    expect(docs.status).toBe(404);
  });
});

describe("404", () => {
  it("devuelve el body de FastAPI", async () => {
    const res = await app.request("/no-existe", undefined, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not Found" });
  });
});
