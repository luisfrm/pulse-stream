import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app";
import { createGoogleClient } from "../src/auth/google";
import type { AppConfig } from "../src/config";
import { createRequestRepositories } from "../src/db/client";

/**
 * Genera `openapi.json` sin DB ni credenciales reales.
 * Uso: `pnpm --filter @pulse-stream/app-api gen:openapi` (requiere `tsx`).
 */
const config: AppConfig = {
  env: "local",
  appUrl: "http://localhost:3000",
  cookieDomain: null,
  corsOrigins: ["http://localhost:3000"],
  authSecret: "openapi-generation-placeholder-secret",
  google: {
    clientId: "openapi-placeholder.apps.googleusercontent.com",
    clientSecret: "openapi-placeholder-secret",
    redirectUri: "http://localhost:8787/auth/google/callback",
  },
  r2PublicBaseUrl: "",
};

const app = createApp({
  config,
  google: createGoogleClient(config.google),
  // Sin `DATABASE_URL`: los repositories existen pero nunca se conectan
  // (generar el documento no ejecuta queries).
  repositories: () => createRequestRepositories({}),
});

const response = await app.request("http://localhost/openapi.json");
if (!response.ok) {
  throw new Error(`Failed to generate OpenAPI document: ${response.status}`);
}

const document: unknown = await response.json();
const outputPath = fileURLToPath(
  new URL("../openapi.json", import.meta.url).toString(),
);
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputPath}`);
