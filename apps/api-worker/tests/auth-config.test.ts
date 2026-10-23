/**
 * Tests unitarios de la configuración de auth/cookies/rate limit (sin DB).
 *
 * Cubren las decisiones que NO pueden cambiar sin romper el contrato con el
 * web: una instancia de better-auth por base, ids uuid, cookie `session` con
 * los atributos de FastAPI y el parseo de `remember`/`"5/minute"`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { getAuth, resetAuthCache } from "@/auth/auth";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  readSetCookie,
} from "@/auth/cookies";
import { parseRateLimit } from "@/middleware/auth";
import { parseRemember } from "@/schemas/auth";
import { testConfig } from "./helpers";

const DATABASE_A = "postgresql://user:pass@localhost:5432/pulse_a";
const DATABASE_B = "postgresql://user:pass@localhost:5432/pulse_b";

describe("getAuth", () => {
  beforeEach(() => resetAuthCache());

  it("cachea la instancia por DATABASE_URL (no por request)", () => {
    const config = testConfig({ DATABASE_URL: DATABASE_A });
    expect(getAuth(config)).toBe(getAuth(testConfig({ DATABASE_URL: DATABASE_A })));
  });

  it("usa instancias distintas para bases distintas", () => {
    const first = getAuth(testConfig({ DATABASE_URL: DATABASE_A }));
    const second = getAuth(testConfig({ DATABASE_URL: DATABASE_B }));
    expect(first).not.toBe(second);
  });

  it("resetAuthCache descarta la instancia", () => {
    const config = testConfig({ DATABASE_URL: DATABASE_A });
    const first = getAuth(config);
    resetAuthCache();
    expect(getAuth(config)).not.toBe(first);
  });

  it("una instancia distinta si cambia AUTH_SECRET, ENV o la cookie", () => {
    const base = getAuth(testConfig({ DATABASE_URL: DATABASE_A }));

    // Rotación del secreto: la instancia vieja firmaba con el secreto viejo.
    expect(
      getAuth(testConfig({ DATABASE_URL: DATABASE_A, AUTH_SECRET: "otro-secreto" })),
    ).not.toBe(base);

    // Otro entorno (tests con ENV=prod vs local).
    expect(getAuth(testConfig({ DATABASE_URL: DATABASE_A, ENV: "prod" }))).not.toBe(
      base,
    );

    // Otra cookie de sesión: cambia el nombre que better-auth emite/lee.
    expect(
      getAuth(testConfig({ DATABASE_URL: DATABASE_A, SESSION_COOKIE_NAME: "sid" })),
    ).not.toBe(base);
  });

  it("no usa el prefijo `__Secure-` (el guard del web lee `session`)", () => {
    // En prod el atributo `Secure` va, pero el NOMBRE no lleva prefijo:
    // better-auth solo lo agrega si `useSecureCookies` es true.
    const auth = getAuth(testConfig({ DATABASE_URL: DATABASE_A, ENV: "prod" }));

    expect(auth.options.advanced?.useSecureCookies).toBe(false);
    expect(auth.options.advanced?.defaultCookieAttributes?.secure).toBe(true);
  });

  it("generateId emite uuid (users.id es uuid, no text)", () => {
    const auth = getAuth(testConfig({ DATABASE_URL: DATABASE_A }));
    const generateId = auth.options.advanced?.database?.generateId;
    expect(typeof generateId).toBe("function");

    const id = (generateId as (options: { model: string }) => string)({
      model: "user",
    });
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("la sesión del servidor vive 7 días y la password mínima es 8", () => {
    const auth = getAuth(testConfig({ DATABASE_URL: DATABASE_A }));
    expect(auth.options.session?.expiresIn).toBe(60 * 60 * 24 * 7);
    // Sin deslizamiento: no se extiende en cada request (paridad con el JWT).
    expect(auth.options.session?.updateAge).toBe(60 * 60 * 24 * 7);
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(8);
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(false);
  });
});

describe("cookies de sesión", () => {
  const config = testConfig({ DATABASE_URL: DATABASE_A });

  it("remember=true emite Max-Age de 7 días", () => {
    expect(buildSessionCookie(config, "token.firma", { persistent: true })).toBe(
      "session=token.firma; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
    );
  });

  it("remember=false emite cookie de sesión (sin Max-Age)", () => {
    expect(buildSessionCookie(config, "token.firma", { persistent: false })).toBe(
      "session=token.firma; Path=/; HttpOnly; SameSite=Lax",
    );
  });

  it("el borrado usa Max-Age=0 y valor vacío", () => {
    expect(buildExpiredSessionCookie(config)).toBe(
      "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  });

  it("en prod/dev emite Domain + Secure (mismo dominio, https)", () => {
    const prod = testConfig({
      DATABASE_URL: DATABASE_A,
      ENV: "prod",
      COOKIE_DOMAIN: "luisrivas.site",
    });

    expect(prod.cookie.secure).toBe(true);
    expect(buildSessionCookie(prod, "token.firma", { persistent: true })).toBe(
      "session=token.firma; Path=/; HttpOnly; SameSite=Lax; " +
        "Domain=luisrivas.site; Max-Age=604800; Secure",
    );
    // El borrado tiene los MISMOS atributos o el navegador no la elimina.
    expect(buildExpiredSessionCookie(prod)).toContain("Domain=luisrivas.site");
    expect(buildExpiredSessionCookie(prod)).toContain("Secure");
  });

  it("en local nunca emite Domain ni Secure (http, host-only)", () => {
    const local = testConfig({
      DATABASE_URL: DATABASE_A,
      COOKIE_DOMAIN: "luisrivas.site",
      COOKIE_SAMESITE: "none",
    });

    expect(local.cookie.secure).toBe(false);
    expect(local.cookie.domain).toBeUndefined();
    const header = buildSessionCookie(local, "token.firma", { persistent: true });
    expect(header).not.toContain("Domain=");
    expect(header).not.toContain("Secure");
    // SameSite=None sobre http lo rechaza el navegador: en local cae a Lax.
    expect(header).toContain("SameSite=Lax");
  });

  it("readSetCookie extrae solo la cookie pedida", () => {
    const headers = new Headers();
    headers.append("set-cookie", "dont_remember=1; Path=/");
    headers.append("set-cookie", "session=abc.def; Path=/; HttpOnly");

    expect(readSetCookie(headers, "session")).toEqual({
      name: "session",
      value: "abc.def",
    });
    expect(readSetCookie(headers, "otra")).toBeNull();
  });
});

describe("parseRemember", () => {
  it("acepta los valores truthy de Pydantic", () => {
    for (const value of ["true", "1", "on", "yes", "T", "y"]) {
      expect(parseRemember(value)).toBe(true);
    }
  });

  it("cualquier otro valor es false", () => {
    for (const value of [undefined, "", "false", "0", "off", "no"]) {
      expect(parseRemember(value)).toBe(false);
    }
  });
});

describe("parseRateLimit", () => {
  it("traduce el formato de slowapi a ventana en segundos", () => {
    expect(parseRateLimit("5/minute")).toEqual({ limit: 5, windowSeconds: 60 });
    expect(parseRateLimit("3/hour")).toEqual({ limit: 3, windowSeconds: 3600 });
    expect(parseRateLimit("10 / minute")).toEqual({
      limit: 10,
      windowSeconds: 60,
    });
    expect(parseRateLimit("2/days")).toEqual({ limit: 2, windowSeconds: 86400 });
  });

  it("un valor inválido es un error de configuración, no un bypass", () => {
    expect(() => parseRateLimit("5/fortnight")).toThrow(/Rate limit inválido/);
    expect(() => parseRateLimit("0/minute")).toThrow(/Rate limit inválido/);
    expect(() => parseRateLimit("minute")).toThrow(/Rate limit inválido/);
  });
});
