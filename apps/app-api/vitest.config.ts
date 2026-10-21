import { defineConfig } from "vitest/config";

// Fase 0: tests de la app Hono con `app.request()` en Node (sin pool de
// Workers). El runtime de Workers se valida en deploy/`wrangler dev`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
  },
});
