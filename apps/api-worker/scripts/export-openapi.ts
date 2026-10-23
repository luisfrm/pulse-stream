/**
 * Exporta el OpenAPI del Worker a `apps/api-worker/openapi.json` (git-ignored).
 *
 * Lo usa `pnpm gen:types:worker` en CI/pnpm para regenerar
 * `packages/api-types/src/generated.ts` SIN un servidor corriendo. Reusa
 * `buildOpenApiDocument`, la misma función que sirve `/openapi.json`: el
 * archivo es byte-idéntico al del server (el gate de CI compara el generado
 * contra el commiteado).
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createConfig } from "../src/env";
import { createApp } from "../src/index";
import { buildOpenApiDocument } from "../src/lib/openapi";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../openapi.json");

// `ENV=local` habilita docs sin exigir secretos (prod hace fail-fast).
// `SESSION_COOKIE_NAME` se respeta si está en el entorno (no afecta los tipos).
const config = createConfig({
  ENV: "local",
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
});

const document = buildOpenApiDocument(createApp(), config);
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

console.log(`OpenAPI escrito en ${outputPath}`);
