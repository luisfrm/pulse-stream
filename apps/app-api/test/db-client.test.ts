import { describe, expect, it } from "vitest";

import { createRequestRepositories, NeonHttpDatabase } from "../src/db/client";

describe("createRequestRepositories", () => {
  it("usa Neon HTTP en local y en producción (mismo driver)", () => {
    for (const env of ["local", "prod"] as const) {
      const repositories = createRequestRepositories({
        ENV: env,
        DATABASE_URL: "postgresql://user:pass@example.neon.tech/db",
      });

      expect(repositories.users).toBeDefined();
      expect(repositories.catalog).toBeDefined();
      expect(repositories.writes).toBeDefined();
      // No hay `HYPERDRIVE` ni rama por ENV.
      expect(
        (repositories.users as unknown as { client: unknown }).client,
      ).toBeInstanceOf(NeonHttpDatabase);
    }
  });

  it("sin DATABASE_URL falla con un mensaje claro al consultar", async () => {
    const repositories = createRequestRepositories({});

    await expect(
      repositories.users.findByIdentifier("nadie@example.com"),
    ).rejects.toThrow("Database is not configured: set DATABASE_URL");
  });
});
