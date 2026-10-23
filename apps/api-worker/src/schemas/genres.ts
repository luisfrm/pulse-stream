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
  .openapi("SongGenre").openapi({ description: "Géneros permitidos.\n\nRegla AGENTS.md: enums viven SOLO en Pydantic — en la DB los géneros se\nguardan como strings (columna JSON de songs). Si agregás un género acá,\nregenerás los tipos TS (`pnpm gen:types`) y TypeScript te avisa en el front." });

export type SongGenre = z.infer<typeof SongGenreEnum>;
