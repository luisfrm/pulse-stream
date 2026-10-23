/**
 * Config de producción: fail-fast.
 *
 * Un deploy con envs incompletos no debe arrancar "a medias": CORS rechazando
 * todo, player sin covers, sesiones sin firmar. `createConfig` lanza en el
 * primer request con la lista de lo que falta (el `onError` lo loguea
 * redactado y responde 500).
 */

import { describe, expect, it } from "vitest";

import { createConfig, type Bindings } from "@/env";

/** Env de producción completo (base para romper un campo por vez). */
const PROD: Bindings = {
  ENV: "prod",
  AUTH_SECRET: "secret",
  DATABASE_URL: "postgresql://user:pass@host/db",
  CORS_ORIGIN_REGEX: "https://([a-z0-9-]+\\.)?pulse\\.com",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_BASE_URL: "https://cdn.pulse.com",
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "Pulse Stream <no-reply@pulse.com>",
  WEB_APP_URL: "https://pulse.com",
};

function expectMissing(overrides: Partial<Bindings>, fragment: string): void {
  expect(() => createConfig({ ...PROD, ...overrides })).toThrowError(fragment);
}

describe("assertProdConfig", () => {
  it("acepta un env de producción completo", () => {
    const config = createConfig(PROD);
    expect(config.env).toBe("prod");
    // En prod la cookie es Secure y el dominio se respeta.
    expect(config.cookie.secure).toBe(true);
  });

  it("en local/dev no valida (los tests corren sin R2)", () => {
    expect(() => createConfig({ ENV: "local", AUTH_SECRET: "x" })).not.toThrow();
    expect(() => createConfig({ ENV: "dev" })).not.toThrow();
  });

  it("exige AUTH_SECRET", () => {
    expectMissing({ AUTH_SECRET: "" }, "AUTH_SECRET");
  });

  it("exige DATABASE_URL", () => {
    expectMissing({ DATABASE_URL: "" }, "DATABASE_URL");
  });

  it("exige CORS_ORIGIN_REGEX y rechaza el placeholder de tudominio.com", () => {
    expectMissing({ CORS_ORIGIN_REGEX: "" }, "CORS_ORIGIN_REGEX");
    expectMissing(
      { CORS_ORIGIN_REGEX: "https://([a-z0-9-]+\\.)?tudominio\\.com" },
      "placeholder 'tudominio.com'",
    );
  });

  it("exige las 4 credenciales de R2 y la base pública", () => {
    for (const key of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_PUBLIC_BASE_URL",
    ] as const) {
      expectMissing({ [key]: "" }, key);
    }
  });

  it("exige la config de email (sin ella el reset de password no manda el mail)", () => {
    expectMissing({ RESEND_API_KEY: "" }, "RESEND_API_KEY");
    expectMissing({ EMAIL_FROM: "" }, "EMAIL_FROM");
    expectMissing({ WEB_APP_URL: "" }, "WEB_APP_URL");
  });

  it("lista TODO lo que falta en un solo mensaje", () => {
    expect(() =>
      createConfig({
        ENV: "prod",
        CORS_ORIGIN_REGEX: "https://example.com",
      }),
    ).toThrowError(/AUTH_SECRET.*DATABASE_URL.*R2_ACCOUNT_ID/s);
  });
});
