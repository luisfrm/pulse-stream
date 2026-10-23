/**
 * Guard de CI: en GitHub Actions los tests de integración NO pueden saltearse
 * en silencio.
 *
 * `describeDb` omite las suites cuando falta `TEST_DATABASE_URL` (para poder
 * correr los tests unitarios en local). En CI eso sería un falso verde: este
 * archivo falla si `CI=true` y la variable no está.
 */

import { describe, expect, it } from "vitest";

import { TEST_DATABASE_URL } from "./helpers";

describe("CI", () => {
  it("exige TEST_DATABASE_URL cuando corre en CI", () => {
    if (process.env.CI !== "true") {
      // En local se permite correr solo los tests unitarios.
      expect(true).toBe(true);
      return;
    }

    expect(
      TEST_DATABASE_URL,
      "En CI falta TEST_DATABASE_URL: los tests de integración se saltearían " +
        "y el job quedaría verde sin probar nada. Configurá el secret " +
        "TEST_DATABASE_URL en el workflow.",
    ).not.toHaveLength(0);
  });
});
