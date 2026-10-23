/**
 * `AlbumDetail` = AlbumRead + canciones ordenadas.
 * Módulo propio para romper el ciclo albums <-> songs (mismo motivo que en
 * `apps/api/app/features/albums/router.py`).
 *
 * Se compone con el `shape` (no con `.extend()`) para que el componente quede
 * como un objeto plano, igual al de Pydantic.
 */

import { z } from "@hono/zod-openapi";

import { albumReadShape } from "./albums";
import { SongReadSchema } from "./songs";

export const AlbumDetailSchema = z
  .object({
    ...albumReadShape(),
    songs: z.array(SongReadSchema).optional(),
  })
  .openapi("AlbumDetail");

export type AlbumDetail = z.infer<typeof AlbumDetailSchema>;
