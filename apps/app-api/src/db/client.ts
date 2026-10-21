import { Client } from "pg";

import type { Env } from "../env";
import { PgUserRepository } from "../features/users/repository";

/**
 * Hyperdrive en producción; `DATABASE_URL` para `wrangler dev` sin binding y
 * tests locales. El `pg.Client` es por request: se conecta perezosamente en la
 * primera query y `app.ts` lo cierra con `ctx.waitUntil`.
 */
export function databaseConnectionString(env: Env): string | undefined {
  const hyperdrive = env.HYPERDRIVE?.connectionString?.trim();
  if (hyperdrive) return hyperdrive;
  return env.DATABASE_URL?.trim() || undefined;
}

export function createRequestUserRepository(env: Env): PgUserRepository {
  const connectionString = databaseConnectionString(env);
  if (!connectionString) {
    // Sin conexión: /health y /openapi.json siguen funcionando; la primera
    // query a users falla con un error explícito.
    return new PgUserRepository(null);
  }

  return new PgUserRepository(
    new Client({
      connectionString,
      connectionTimeoutMillis: 10_000,
    }),
  );
}
