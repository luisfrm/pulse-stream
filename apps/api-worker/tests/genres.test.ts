/**
 * `GET /genres` (espejo de `features/genres/router.py`).
 *
 * Endpoint público y estático (sin DB): devuelve los 12 géneros en el orden de
 * declaración del enum de Python. No usa `describeDb` a propósito: corre aunque
 * no haya `TEST_DATABASE_URL`.
 */

import { describe, expect, it } from "vitest";

import { createClient } from "./helpers";

/** Orden exacto de `SongGenre` en `apps/api/app/features/genres/schemas.py`. */
const GENRES = [
  "pop",
  "rock",
  "hip-hop",
  "electronic",
  "jazz",
  "classical",
  "reggaeton",
  "folk",
  "metal",
  "r&b",
  "latin",
  "indie",
];

describe("genres", () => {
  it("lista los géneros permitidos en el orden del enum (sin sesión)", async () => {
    const response = await createClient().get("/genres");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(GENRES);
  });
});
