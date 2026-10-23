/**
 * Middlewares de autenticación/autorización + rate limiting.
 *
 * Espejo de `features/auth/manager.py` (`current_user`, `require_admin`,
 * `current_superuser`) y de `core/security.py` (slowapi). El 401/403/429 y sus
 * `detail` son EXACTAMENTE los de Python: el web los muestra tal cual.
 */

import { sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";

import { getAuth } from "@/auth/auth";
import { createDb } from "@/db/client";
import { session, users, verification, type UserRow } from "@/db/schema";
import type { AppConfig } from "@/env";
import type { AppEnv } from "@/index";
import {
  AdminRequiredError,
  RateLimitExceededError,
  UnauthorizedError,
} from "@/lib/errors";
import { findUserById } from "@/repositories/users";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  seconds: 1,
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
  day: 86400,
  days: 86400,
};

/**
 * `"5/minute"` -> `{ limit: 5, windowSeconds: 60 }` (formato de slowapi).
 * Un valor inválido es un error de configuración, no un bypass silencioso.
 */
export function parseRateLimit(rule: string): RateLimitRule {
  const match = /^\s*(\d+)\s*\/\s*([a-zA-Z]+)\s*$/.exec(rule);
  const rawLimit = match?.[1];
  const unit = match?.[2]?.toLowerCase();
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : Number.NaN;
  const windowSeconds = unit ? UNIT_SECONDS[unit] : undefined;

  if (!Number.isFinite(limit) || limit <= 0 || windowSeconds === undefined) {
    throw new Error(
      `Rate limit inválido: "${rule}". Formato esperado: "<n>/<second|minute|hour|day>".`,
    );
  }

  return { limit, windowSeconds };
}

/**
 * IP del cliente para el rate limiting.
 *
 * Fuera de local solo se confía en `cf-connecting-ip` (lo inyecta Cloudflare
 * y no lo puede falsificar el cliente). `x-forwarded-for` es spoofeable en el
 * edge, así que sin ese header se usa un bucket compartido `"unknown"` (peor
 * caso: el límite es global, nunca un bypass). En local sí se acepta XFF para
 * poder simular IPs en los tests.
 */
function clientIp(c: Context<AppEnv>): string {
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf) return cf;

  if (c.get("config").isLocal) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }

  return "unknown";
}

/**
 * Limpieza oportunista de `rate_limits`.
 *
 * La tabla crece con una fila por `bucket:ip`; nada la vacía. Se borran las
 * ventanas de más de un día aprovechando que la ventana se reinicia (el
 * `INSERT ... ON CONFLICT` devuelve `count = 1`), así el DELETE corre como
 * mucho una vez por clave y ventana y no en cada request. Es un DELETE
 * independiente (sin transacción): si falla, se ignora y el rate limit sigue.
 */
async function cleanupStaleRateLimits(config: AppConfig): Promise<void> {
  try {
    await createDb(config).execute(sql`
      DELETE FROM rate_limits WHERE "window_start" < now() - interval '1 day'
    `);
  } catch (error) {
    console.warn("rate_limits_cleanup_failed", {
      name: error instanceof Error ? error.name : typeof error,
    });
  }
}

/** Ventana mínima entre limpiezas de sesiones (barato: 1 chequeo en memoria). */
const AUTH_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastAuthCleanupAt = 0;

/**
 * Limpieza oportunista de `session` y `verification` vencidas.
 *
 * better-auth deja las filas al expirar (no las borra): sin esto la tabla
 * `session` crece para siempre. Se hace como máximo una vez cada
 * `AUTH_CLEANUP_INTERVAL_MS` (contador en memoria por isolate, sin queries
 * extra) y NUNCA bloquea la request: se dispara y se ignora cualquier error
 * (la sesión vencida se rechaza igual porque `getSession` valida `expiresAt`).
 *
 * Las dos sentencias van en un `db.batch` (una transacción del lado de Neon).
 */
export function cleanupStaleAuthRows(config: AppConfig): void {
  const now = Date.now();
  if (now - lastAuthCleanupAt < AUTH_CLEANUP_INTERVAL_MS) return;
  lastAuthCleanupAt = now;

  void (async () => {
    try {
      const db = createDb(config);
      await db.batch([
        db.delete(session).where(sql`${session.expiresAt} < now()`),
        db.delete(verification).where(sql`${verification.expiresAt} < now()`),
      ] as const);
    } catch (error) {
      console.warn("auth_cleanup_failed", {
        name: error instanceof Error ? error.name : typeof error,
      });
    }
  })();
}

/**
 * Ventana fija en `rate_limits` con UNA sola sentencia atómica
 * (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`): el driver HTTP de
 * Neon no soporta transacciones interactivas y un SELECT+UPDATE tendría
 * carrera entre requests concurrentes.
 */
export async function enforceRateLimit(
  c: Context<AppEnv>,
  bucket: string,
  rule: string,
): Promise<void> {
  const config = c.get("config");
  if (config.rateLimitDisabled) return;

  const { limit, windowSeconds } = parseRateLimit(rule);
  const key = `${bucket}:${clientIp(c)}`;

  const result = await createDb(config).execute(sql`
    INSERT INTO rate_limits ("key", "count", "window_start")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN rate_limits."window_start" < now() - (${windowSeconds}::int * interval '1 second')
          THEN 1
        ELSE rate_limits."count" + 1
      END,
      "window_start" = CASE
        WHEN rate_limits."window_start" < now() - (${windowSeconds}::int * interval '1 second')
          THEN now()
        ELSE rate_limits."window_start"
      END
    RETURNING "count"
  `);

  const count = readCount(result);

  // `count === 1` = ventana nueva (o expirada): momento barato para limpiar.
  if (count === 1) await cleanupStaleRateLimits(config);

  if (count > limit) {
    throw new RateLimitExceededError();
  }
}

/** `db.execute` devuelve `{ rows }` en neon-http y un array en otros drivers. */
function readCount(result: unknown): number {
  const rows = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.rows)
      ? result.rows
      : [];
  const first = rows[0];
  if (!isRecord(first)) return 0;
  const raw = first.count;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Sesión válida -> fila COMPLETA de `users`.
 *
 * better-auth solo conoce su propio modelo (email, name, image...); la API
 * necesita `role`, `username`, `cover_key` y `total_plays`, así que se relee
 * la fila. `is_active === false` = 401 (fastapi-users: `active=True`).
 */
export async function resolveUser(c: Context<AppEnv>): Promise<UserRow> {
  const config: AppConfig = c.get("config");
  const authSession = await getAuth(config).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!authSession) throw new UnauthorizedError();

  // Oportunista y sin bloquear la respuesta: barre sesiones/verificaciones
  // vencidas como mucho una vez cada 5 minutos por isolate.
  cleanupStaleAuthRows(config);

  const user = await findUserById(config, authSession.user.id);
  if (!user || !user.isActive) throw new UnauthorizedError();

  return user;
}

/** `Depends(current_user)`: 401 `{"detail": "Unauthorized"}`. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", await resolveUser(c));
  await next();
};

/** `Depends(require_admin)`: `role=admin` o `is_superuser`. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveUser(c);
  if (user.role !== "admin" && !user.isSuperuser) {
    throw new AdminRequiredError();
  }
  c.set("user", user);
  await next();
};

/** `Depends(current_superuser)`: 403 `{"detail": "Forbidden"}`. */
export const requireSuperuser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveUser(c);
  if (!user.isSuperuser) {
    throw new AdminRequiredError("Forbidden");
  }
  c.set("user", user);
  await next();
};
