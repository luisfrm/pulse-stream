/**
 * Gate de `Origin` para métodos mutantes (CSRF).
 *
 * Reemplaza al double-submit CSRF que el backend Python dejó pendiente (ver
 * AGENTS.md): con `SameSite=lax` el navegador no manda la cookie en un POST
 * cross-site, pero con `COOKIE_SAMESITE=none` (front y API en dominios
 * distintos) SÍ la manda, así que hace falta una defensa propia.
 *
 * Regla:
 *   - métodos seguros (GET/HEAD/OPTIONS) -> siempre pasan;
 *   - sin header `Origin` (curl, SSR, tests) -> pasa: no hay navegador que
 *     esté actuando por el usuario;
 *   - `Origin` presente y no matchea `CORS_ORIGIN_REGEX` (fullmatch, igual que
 *     Starlette) -> 403 `{"detail": "Origin no permitido"}`.
 *
 * Se apoya en el MISMO regex que CORS (`lib/cors.ts`), así un origin que puede
 * leer la respuesta es exactamente el que puede mutar estado.
 */

import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "@/index";
import { isAllowedOrigin } from "@/lib/cors";

/** Métodos que cambian estado (los que el navegador puede forzar cross-site). */
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export const ORIGIN_NOT_ALLOWED = "Origin no permitido";

export const requireTrustedOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method.toUpperCase())) {
    await next();
    return;
  }

  const origin = c.req.header("origin");
  if (origin && !isAllowedOrigin(origin, c.get("config").corsOriginRegex)) {
    return c.json({ detail: ORIGIN_NOT_ALLOWED }, 403);
  }

  await next();
};
