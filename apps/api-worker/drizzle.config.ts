/**
 * Config de drizzle-kit.
 *
 * OJO: `dbCredentials` SOLO toma `MIGRATE_DATABASE_URL`. No hay fallback a
 * `DATABASE_URL` a propósito: `drizzle-kit push`/`pull` están prohibidos en
 * este proyecto y un fallback silencioso podría apuntar a producción. Para
 * `db:generate`/`db:check` la URL no se usa; para aplicar migraciones se usa
 * `scripts/migrate.ts` (que además exige confirmación si el host no es el de
 * test).
 */

import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

loadEnv({ path: ".dev.vars" });

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  // `prefix: "timestamp"` (default de drizzle-kit): los próximos `db:generate`
  // no colisionan con el `0001` hand-written.
  migrations: { prefix: "timestamp" },
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
} satisfies Config;
