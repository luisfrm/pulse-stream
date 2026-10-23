/**
 * Aplica las migraciones de `migrations/` contra Neon.
 *
 * SOLO se usa `MIGRATE_DATABASE_URL` (sin fallback a `DATABASE_URL`): así un
 * `.dev.vars` con la URL de producción no migra prod por accidente.
 *
 * Guard de destino: si el host/base no coincide con `TEST_DATABASE_URL`
 * (también de `.dev.vars`), hace falta `CONFIRM_TARGET=yes` explícito.
 *
 * OJO: no hay transacciones interactivas con el driver HTTP; el migrador de
 * drizzle corre las sentencias una por una.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".dev.vars" });

interface Target {
  host: string;
  database: string;
  /** Id del endpoint de Neon (primera etiqueta, sin el sufijo `-pooler`). */
  endpoint: string;
}

function parseTarget(raw: string | undefined, label: string): Target | undefined {
  if (!raw || raw.trim() === "") return undefined;
  try {
    const url = new URL(raw.trim());
    const database = url.pathname.replace(/^\//, "") || "<sin base>";
    return {
      host: url.host,
      database,
      endpoint: (url.hostname.split(".")[0] ?? "").replace(/-pooler$/, ""),
    };
  } catch {
    throw new Error(`${label} no es una URL válida.`);
  }
}

const url = process.env.MIGRATE_DATABASE_URL?.trim();

if (!url) {
  throw new Error(
    "Falta MIGRATE_DATABASE_URL en .dev.vars (o en el entorno). No se usa DATABASE_URL a propósito: apuntar a prod debe ser explícito.",
  );
}

const target = parseTarget(url, "MIGRATE_DATABASE_URL");
if (!target) {
  throw new Error("MIGRATE_DATABASE_URL vacía en .dev.vars.");
}

const testTarget = parseTarget(
  process.env.TEST_DATABASE_URL,
  "TEST_DATABASE_URL",
);

// Mismo endpoint de Neon + misma base = es el destino de test. El pooler
// (`-pooler`) y la conexión directa comparten endpoint, así que se comparan
// sin ese sufijo.
const matchesTest =
  testTarget !== undefined &&
  testTarget.endpoint === target.endpoint &&
  testTarget.database === target.database;

console.log(`Destino: host=${target.host} base=${target.database}`);

if (!matchesTest) {
  if (testTarget) {
    console.log(
      `Referencia de test: host=${testTarget.host} base=${testTarget.database}`,
    );
  } else {
    console.log("TEST_DATABASE_URL no está definida: no hay destino de referencia.");
  }

  if (process.env.CONFIRM_TARGET !== "yes") {
    throw new Error(
      "El destino de MIGRATE_DATABASE_URL NO coincide con TEST_DATABASE_URL. " +
        "Si realmente querés migrar ese host, corré con CONFIRM_TARGET=yes.",
    );
  }

  console.log("CONFIRM_TARGET=yes: migrando un destino distinto al de test.");
}

const db = drizzle(neon(url));
await migrate(db, { migrationsFolder: "./migrations" });

console.log("Migraciones aplicadas.");
