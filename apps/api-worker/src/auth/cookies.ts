/**
 * Cookies de sesión: puente entre better-auth y el contrato de FastAPI.
 *
 * Python emite `Set-Cookie` con `CookieTransport`:
 *   remember=True  -> `session=<jwt>; Max-Age=604800; ...`
 *   remember=False -> `session=<jwt>; ...` (cookie de sesión, sin Max-Age)
 *
 * better-auth firma la cookie (`<token>.<hmac>`), así que el VALOR se reusa
 * tal cual; solo se reescriben los atributos para que el `remember` de
 * `POST /auth/login` funcione igual que antes y para no filtrar cookies
 * extra de better-auth (`dont_remember`, `session_data`, ...).
 */

import type { AppConfig } from "@/env";

export interface ParsedSetCookie {
  name: string;
  value: string;
}

/** Valor crudo de la cookie `name` en los `Set-Cookie` de `headers`. */
export function readSetCookie(
  headers: Headers,
  name: string,
): ParsedSetCookie | null {
  for (const header of readSetCookieHeaders(headers)) {
    const separator = header.indexOf("=");
    if (separator <= 0) continue;
    const cookieName = header.slice(0, separator).trim();
    if (cookieName !== name) continue;
    const rest = header.slice(separator + 1);
    const end = rest.indexOf(";");
    return {
      name: cookieName,
      value: (end === -1 ? rest : rest.slice(0, end)).trim(),
    };
  }
  return null;
}

/**
 * `Headers.getSetCookie()` (fetch spec). Workers/undici SIEMPRE lo exponen:
 * el fallback a `get("set-cookie")` concatenaría varias cookies en un solo
 * string y podría devolver el valor equivocado, así que se falla explícito.
 */
function readSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie !== "function") {
    throw new Error(
      "Headers.getSetCookie() no está disponible en este runtime: no se pueden leer las cookies de sesión de better-auth.",
    );
  }
  return withGetter.getSetCookie();
}

interface SessionCookieOptions {
  /** `false` -> cookie de sesión (sin Max-Age/Expires), como Python. */
  persistent: boolean;
  /** Default: el `maxAge` de la config (7 días). */
  maxAge?: number;
}

/**
 * `Set-Cookie` de la sesión con los atributos de `config.cookie`.
 * Sin `Max-Age` cuando `persistent` es false: el navegador la descarta al
 * cerrarse (mismo efecto que `max_age=None` en Starlette).
 */
export function buildSessionCookie(
  config: AppConfig,
  value: string,
  options: SessionCookieOptions,
): string {
  const attributes = [
    `Path=${config.cookie.path}`,
    `HttpOnly`,
    `SameSite=${config.cookie.sameSite === "none" ? "None" : "Lax"}`,
  ];

  if (config.cookie.domain) attributes.push(`Domain=${config.cookie.domain}`);
  if (options.persistent) {
    attributes.push(`Max-Age=${options.maxAge ?? config.cookie.maxAge}`);
  }
  if (config.cookie.secure) attributes.push("Secure");

  return `${config.cookie.name}=${value}; ${attributes.join("; ")}`;
}

/** `Set-Cookie` que borra la sesión (`Max-Age=0`, valor vacío). */
export function buildExpiredSessionCookie(config: AppConfig): string {
  const attributes = [
    `Path=${config.cookie.path}`,
    `HttpOnly`,
    `SameSite=${config.cookie.sameSite === "none" ? "None" : "Lax"}`,
  ];

  if (config.cookie.domain) attributes.push(`Domain=${config.cookie.domain}`);
  attributes.push("Max-Age=0");
  if (config.cookie.secure) attributes.push("Secure");

  return `${config.cookie.name}=; ${attributes.join("; ")}`;
}
