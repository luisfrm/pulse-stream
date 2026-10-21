import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

import type { AppConfig } from "../config";
import type { AppBindings } from "../types";

/**
 * Cookie de sesión de la app.
 *
 * `session`: HttpOnly, Path=/, SameSite=Lax, Secure salvo `ENV=local`,
 * 7 días. Con `COOKIE_DOMAIN` seteado viaja a los subdominios del dominio
 * registrable (en prod app/api son subdominios distintos).
 */
export const SESSION_COOKIE = "session";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días

type CookieContext = Context<AppBindings>;

function baseOptions(config: AppConfig, path: string, maxAge: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    path,
    sameSite: "Lax",
    secure: config.env !== "local",
    maxAge,
  };

  if (config.cookieDomain) {
    options.domain = config.cookieDomain;
  }

  return options;
}

export function setSessionCookie(
  c: CookieContext,
  token: string,
  config: AppConfig,
): void {
  setCookie(
    c,
    SESSION_COOKIE,
    token,
    baseOptions(config, "/", SESSION_MAX_AGE_SECONDS),
  );
}

/** Expira la cookie (`Max-Age=0`) manteniendo path/domain/atributos. */
export function clearSessionCookie(c: CookieContext, config: AppConfig): void {
  setCookie(c, SESSION_COOKIE, "", baseOptions(config, "/", 0));
}

export function getSessionCookie(c: CookieContext): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
