import { cache } from "hono/cache";
import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../types";

/**
 * Caché de lecturas públicas (60 s) en el edge de Workers.
 *
 * Solo se aplica a GETs sin datos por usuario (`/songs*`, `/albums*`,
 * `/artists*`, `/genres`, `/playlists/public`). Nunca a `/me/*`, `/users/me`
 * ni `/playlists/{id}` (el detalle depende de la sesión para el 403).
 *
 * En Node (`app.request()` de los tests) no existe `caches`: no-op.
 */
export const PUBLIC_CACHE_MAX_AGE_SECONDS = 60;
export const PUBLIC_CACHE_NAME = "pulse-app-public-v1";

export function publicCache(
  maxAge: number = PUBLIC_CACHE_MAX_AGE_SECONDS,
): MiddlewareHandler<AppBindings> {
  const cacheStorage = (globalThis as { caches?: unknown }).caches;

  if (cacheStorage === undefined) {
    return async (_c, next) => {
      await next();
    };
  }

  return cache({
    cacheName: PUBLIC_CACHE_NAME,
    cacheControl: `max-age=${maxAge}`,
    // `wait: true`: el `cache.put` se espera (determinista en Workers y en
    // tests con un `caches` fake; no depende de `executionCtx`).
    wait: true,
  }) as unknown as MiddlewareHandler<AppBindings>;
}
