/**
 * CORS: el matcher debe comportarse como `re.fullmatch` de Starlette.
 *
 * Un `RegExp.test` parcial deja pasar `https://luisrivas.site.evil.com` con el
 * patrón `https://([a-z0-9-]+\.)?luisrivas\.site`, que es exactamente el bypass
 * que este test previene.
 */

import { describe, expect, it } from "vitest";

import type { Bindings } from "@/env";
import { app } from "@/index";
import { compileOriginMatcher, isAllowedOrigin } from "@/lib/cors";

const PROD_ORIGIN_REGEX =
  "https://([a-zA-Z0-9-]+\\.)?luisrivas\\.site|http://localhost:\\d+";

const devEnv: Bindings = {
  ENV: "dev",
  AUTH_SECRET: "test-secret",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/pulse",
  CORS_ORIGIN_REGEX: PROD_ORIGIN_REGEX,
};

describe("compileOriginMatcher", () => {
  const allowed = compileOriginMatcher(PROD_ORIGIN_REGEX);

  it.each([
    "https://luisrivas.site",
    "https://pulse-stream.luisrivas.site",
    "http://localhost:3000",
  ])("acepta %s", (origin) => {
    expect(allowed(origin)).toBe(true);
  });

  it.each([
    // El sufijo hace que el dominio registrable sea `evil.com`.
    "https://luisrivas.site.evil.com",
    // Prefijo/sufijo arbitrario: sin anclas el patrón matchearía el substring.
    "https://evil.com/?x=luisrivas.site",
    "https://evil.com/#luisrivas.site",
    "http://luisrivas.site.evil.com",
    "http://localhost.evil.com:3000",
    "https://notluisrivas.site",
  ])("rechaza %s", (origin) => {
    expect(allowed(origin)).toBe(false);
  });

  it("falla cerrado con un regex inválido", () => {
    const matcher = compileOriginMatcher("([unclosed");
    expect(matcher("https://luisrivas.site")).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("sin Origin no hay nada que validar", () => {
    expect(isAllowedOrigin(undefined, PROD_ORIGIN_REGEX)).toBe(false);
  });
});

describe("middleware CORS del app", () => {
  it("no devuelve headers CORS para un origin parecido al permitido", async () => {
    const response = await app.request(
      "/health",
      { headers: { Origin: "https://luisrivas.site.evil.com" } },
      devEnv,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("devuelve el origin exacto (con credenciales) para un origin permitido", async () => {
    const response = await app.request(
      "/health",
      { headers: { Origin: "https://pulse-stream.luisrivas.site" } },
      devEnv,
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://pulse-stream.luisrivas.site",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });
});
