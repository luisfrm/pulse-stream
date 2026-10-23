import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `.dev.vars` -> `process.env` de los tests.
 *
 * Los tests de integración necesitan los MISMOS bindings que `wrangler dev`
 * (AUTH_SECRET, DATABASE_URL, R2_*, COOKIE_*). Se leen acá (no en cada test)
 * para que `tests/helpers.ts` solo consulte `process.env`.
 */
function readDevVars(): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(new URL("./.dev.vars", import.meta.url), "utf8");
  } catch {
    // Sin `.dev.vars` (CI): los tests de DB se saltean solos.
    return {};
  }

  const vars: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    vars[key] = value;
  }
  return vars;
}

const devVars = readDevVars();

export default defineConfig({
  resolve: {
    alias: {
      // Mismo alias que tsconfig (`@/*` -> src/*).
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Los tests usan `app.request()` sobre el runtime de Node (Request/Response
    // globales): no hace falta miniflare ni un pool específico de Workers.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Los suites de integración comparten UNA base de test y cada uno hace
    // `TRUNCATE` en `beforeEach`: en paralelo se borran los datos entre sí.
    fileParallelism: false,
    env: {
      ...devVars,
      // Los tests apuntan SIEMPRE a la base de test: nunca a `DATABASE_URL`
      // (que en `.dev.vars` es la de desarrollo/producción).
      DATABASE_URL: devVars.TEST_DATABASE_URL ?? "",
    },
  },
});
