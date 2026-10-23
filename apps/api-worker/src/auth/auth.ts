/**
 * Instancia de better-auth (F2).
 *
 * Reemplaza a `apps/api/app/features/auth/{backend,manager}.py`:
 *   - cookie de sesión HttpOnly con el MISMO nombre (`session`) y la misma
 *     vida útil (7 días);
 *   - passwords con scrypt (mismo algoritmo que `better-auth/crypto`), no
 *     argon2 (las passwords legacy se resetean out-of-band);
 *   - `users.id` sigue siendo `uuid` (ver `advanced.database.generateId`).
 *
 * La instancia se construye UNA sola vez por isolate y se cachea por la
 * combinación `DATABASE_URL|AUTH_SECRET|ENV|SESSION_COOKIE_NAME`: es lo que
 * define el adapter, la firma de las cookies y sus atributos. Cachear solo por
 * `DATABASE_URL` reusaría una instancia con otro secreto (rotación) u otro
 * entorno (tests). `betterAuth()` levanta estado interno (adapter, hooks,
 * generador de cookies) y crearlo por request sería un desperdicio.
 *
 * IMPORTANTE: better-auth NUNCA se expone como router HTTP (`basePath`
 * `/internal/auth` no está montado). Los endpoints públicos viven en
 * `src/routes/auth.ts` y llaman a `auth.api.*` en el server, así el contrato
 * de respuestas/cookies queda idéntico al de FastAPI.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { createDb } from "@/db/client";
import * as schema from "@/db/schema";
import { requireAuthSecret, requireDatabaseUrl, type AppConfig } from "@/env";
import { USERNAME_REGEX } from "@/schemas/common";

export type Auth = ReturnType<typeof createAuth>;

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** Caché por `DATABASE_URL|AUTH_SECRET|ENV|SESSION_COOKIE_NAME`. */
const authCache = new Map<string, Auth>();

/** Solo tests: descarta la instancia cacheada al cambiar de binding. */
export function resetAuthCache(): void {
  authCache.clear();
}

function createAuth(config: AppConfig) {
  const databaseUrl = requireDatabaseUrl(config);
  const secret = requireAuthSecret(config);
  const db = createDb(config);

  return betterAuth({
    secret,
    // No hay router HTTP montado: `baseURL` solo se usa para URLs internas.
    baseURL: config.apiUrl,
    basePath: "/internal/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      // better-auth resuelve `schema[modelName]`: con `user.modelName =
      // "users"` la clave real es `users`. Se mantiene `user` además para
      // que el adapter encuentre el modelo si cambia la resolución interna.
      schema: {
        user: schema.users,
        users: schema.users,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    advanced: {
      database: {
        // `users.id` es uuid: los ids `text` de better-auth romperían la FK.
        generateId: () => crypto.randomUUID(),
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
      // OJO: SIEMPRE `false`. Con `true`, better-auth prefija el nombre de la
      // cookie con `__Secure-` (`__Secure-session`) mientras el guard del web
      // (`apps/web/proxy.ts`) y este worker leen/emiten `session`: el login
      // devolvería 500 (no encuentra su propia cookie) y toda request
      // autenticada daría 401. El atributo `Secure` NO depende de esto: se
      // sigue emitiendo desde `config.cookie.secure` (abajo y en
      // `auth/cookies.ts`).
      useSecureCookies: false,
      // Mismos atributos para todas las cookies (una sola fuente: `config`).
      defaultCookieAttributes: {
        path: config.cookie.path,
        httpOnly: config.cookie.httpOnly,
        sameSite: config.cookie.sameSite,
        // `Secure` en dev/prod aunque el prefijo `__Secure-` esté desactivado.
        secure: config.cookie.secure,
        ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
      },
      cookies: {
        session_token: {
          name: config.cookie.name,
          attributes: {
            path: config.cookie.path,
            httpOnly: config.cookie.httpOnly,
            sameSite: config.cookie.sameSite,
            secure: config.cookie.secure,
            maxAge: SESSION_MAX_AGE_SECONDS,
            ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
          },
        },
      },
      ...(config.cookie.domain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: config.cookie.domain,
            },
          }
        : {}),
      // Paridad con Python: fastapi-users no valida Origin ni CSRF. Sin esto,
      // el web en :3000 sería rechazado por el origin-check interno de
      // better-auth al llamar a la API en :8001. La defensa CSRF real vive en
      // `src/middleware/origin.ts` (gate de `Origin` en métodos mutantes), no
      // acá: better-auth no está montado como router.
      disableCSRFCheck: true,
      disableOriginCheck: true,
    },
    user: {
      modelName: "users",
      // OJO: los valores de `fields` son los NOMBRES DE PROPIEDAD del schema
      // de Drizzle (el adapter hace `table[fieldName]`), NO el nombre físico
      // de la columna. Drizzle traduce `isVerified` -> `is_verified` y
      // `coverKey` -> `cover_key`. Usar el nombre de la columna acá rompe
      // better-auth ("Drizzle schema mismatch" + columnas undefined).
      fields: {
        emailVerified: "isVerified",
        image: "coverKey",
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false,
      sendResetPassword: async ({ user }) => {
        // Log-only: el envío real de emails no está implementado (igual que
        // el `on_after_forgot_password` no-op de Python).
        // NUNCA loguear `url`: contiene el token bearer de un solo uso.
        console.info("reset_password_requested", { userId: user.id });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user }) => {
        // Mismo criterio: `url` lleva el token de verificación, no se loguea.
        console.info("verify_email_requested", { userId: user.id });
      },
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      // Sin deslizamiento: el JWT de Python expiraba a los 7 días fijos, así
      // que la sesión del servidor NO se extiende en cada request. Con
      // `updateAge === expiresIn` el `expiresAt` solo se recalcularía cuando
      // la sesión ya venció.
      updateAge: SESSION_MAX_AGE_SECONDS,
    },
    // NO se configura `rateLimit`: el router HTTP de better-auth no está
    // montado y las llamadas server-side a `auth.api.*` no pasan por su
    // limiter, así que ese bloque sería inerte. El único rate limiting es
    // `enforceRateLimit` (`src/middleware/auth.ts`), que además devuelve el
    // body 429 de slowapi.
    plugins: [
      username({
        minUsernameLength: 2,
        maxUsernameLength: 50,
        displayUsername: false,
        // Python preservaba el case y validaba la unicidad
        // case-insensitive en la capa de aplicación: mismo comportamiento.
        usernameNormalization: false,
        usernameValidator: (value) => USERNAME_REGEX.test(value),
      }),
    ],
  });
}

/**
 * Instancia de better-auth para el `config` del request actual.
 *
 * Se cachea por `DATABASE_URL|AUTH_SECRET|ENV|SESSION_COOKIE_NAME`: rotar el
 * secreto, cambiar de entorno o renombrar la cookie invalida la instancia.
 */
export function getAuth(config: AppConfig): Auth {
  const key = [
    requireDatabaseUrl(config),
    requireAuthSecret(config),
    config.env,
    config.cookie.name,
  ].join("|");
  const cached = authCache.get(key);
  if (cached) return cached;

  const instance = createAuth(config);
  authCache.set(key, instance);
  return instance;
}
