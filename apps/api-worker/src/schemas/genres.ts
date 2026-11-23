/**
 * Géneros permitidos (espejo de `features/genres/schemas.py`).
 *
 * Regla del proyecto: los enums viven solo en zod; en la DB `songs.genres` es
 * una columna JSON de strings.
 */

import { z } from "@hono/zod-openapi";

/**
 * Valores canónicos de género (única fuente).
 *
 * La DB NO tiene enum: `songs.genres` es una columna JSON de strings. Este
 * tuple alimenta el componente `SongGenre` y el enum de query params de
 * `GET /songs?genre=`, así agregar un género es tocar un solo lugar.
 */
export const SONG_GENRES = [
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
] as const;

export const SongGenreEnum = z
  .enum(SONG_GENRES)
  .openapi("SongGenre").openapi({ description: "Géneros permitidos.\n\nRegla AGENTS.md: enums viven SOLO en Pydantic — en la DB los géneros se\nguardan como strings (columna JSON de songs). Si agregás un género acá,\nregenerás los tipos TS (`pnpm gen:types`) y TypeScript te avisa en el front." });

/**
 * Mismo set para QUERY PARAMS (`GET /songs?genre=`), sin `refId`.
 *
 * Alternativa considerada: `nullableRef(SongGenreEnum)` (el helper de
 * `./common`) para reusar el enum con `$ref`. Se prefirió el enum inline
 * porque el param no depende de que el componente `SongGenre` esté registrado
 * en el call site y porque el tuple ya es la única fuente de valores: acá solo
 * se deriva el schema sin `refId`, evitando el re-registro con `null` que
 * `SongGenreEnum.nullable()` provocaría en `components.schemas`.
 */
export const SongGenreQueryEnum = z.enum(SONG_GENRES);

export type SongGenre = z.infer<typeof SongGenreEnum>;
