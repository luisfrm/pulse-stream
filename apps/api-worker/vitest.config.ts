import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    include: ["src/**/*.test.ts"],
  },
});
