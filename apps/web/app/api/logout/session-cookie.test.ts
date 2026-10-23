/**
 * Logout del web: borrado de la cookie `session` + validación del `?next=`.
 *
 * Cubre el GET de limpieza que usan los layouts (cookie vencida o de otro
 * backend): el `Set-Cookie` de expiración es lo que corta el loop de redirects
 * entre el proxy y `/login`.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOGOUT_NEXT,
  clearedSessionCookies,
  resolveNextPath,
} from "./session-cookie";

describe("resolveNextPath", () => {
  it("acepta rutas locales (incluido query string)", () => {
    expect(resolveNextPath("/panel")).toBe("/panel");
    expect(resolveNextPath("/login?next=/panel")).toBe("/login?next=/panel");
    expect(resolveNextPath("  /settings  ")).toBe("/settings");
    expect(resolveNextPath("/")).toBe("/");
  });

  it("cae en /login para destinos no locales o vacíos", () => {
    for (const candidate of [
      undefined,
      null,
      "",
      "   ",
      "//evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/\\evil.com",
    ]) {
      expect(resolveNextPath(candidate)).toBe(DEFAULT_LOGOUT_NEXT);
    }
  });
});

describe("clearedSessionCookies", () => {
  it("en local emite una cookie host-only, SameSite=Lax y sin Secure", () => {
    const cookies = clearedSessionCookies({ ENV: "local" });

    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("session=;");
    expect(cookies[0]).toContain("Max-Age=0");
    expect(cookies[0]).toContain("SameSite=lax");
    expect(cookies[0]).not.toContain("Secure");
    expect(cookies[0]).not.toContain("Domain=");
  });

  it("en prod con COOKIE_DOMAIN emite host-only + con Domain, Secure y SameSite", () => {
    const cookies = clearedSessionCookies({
      ENV: "prod",
      COOKIE_DOMAIN: "pulse.com",
      COOKIE_SAMESITE: "none",
    });

    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("Secure");
    expect(cookies[0]).toContain("SameSite=none");
    expect(cookies[0]).not.toContain("Domain=");
    expect(cookies[1]).toContain("Domain=pulse.com");
    // Las dos borran la cookie (Max-Age=0) y expiran en 1970.
    expect(cookies.every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.every((cookie) => cookie.includes("01 Jan 1970"))).toBe(true);
  });

  it("en local ignora un COOKIE_DOMAIN heredado (el borrado debe matchear)", () => {
    const cookies = clearedSessionCookies({
      ENV: "local",
      COOKIE_DOMAIN: "pulse.com",
    });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).not.toContain("Domain=");
  });
});
