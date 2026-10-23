/**
 * Géneros permitidos (espejo de `features/genres/schemas.py`).
 *
 * Regla del proyecto: los enums viven solo en zod; en la DB `songs.genres` es
 * una columna JSON de strings.
 */

import { z } from "@hono/zod-openapi";

export const SongGenreEnum = z
  .enum([
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
  ])
  .openapi("SongGenre");

export type SongGenre = z.infer<typeof SongGenreEnum>;
