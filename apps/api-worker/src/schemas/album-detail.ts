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
  .openapi("AlbumDetail").openapi({ description: "Álbum con sus canciones ordenadas.\n\nVive acá (no en schemas.py) para evitar el ciclo de imports entre\nalbums.schemas (AlbumRead) y songs.schemas (SongRead)." });

export type AlbumDetail = z.infer<typeof AlbumDetailSchema>;
