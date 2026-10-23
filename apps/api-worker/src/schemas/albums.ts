/**
 * DTOs de álbum (espejo de `features/albums/schemas.py`).
 * `AlbumDetail` vive en su propio módulo (igual que en el backend Python,
 * donde está en el router) para evitar el ciclo albums <-> songs.
 */

import { z } from "@hono/zod-openapi";

import {
  DateTimeSchema,
  IntSchema,
  UuidSchema,
  nullableRef,
  optionalCoverKeySchema,
} from "./common";
import { ArtistReadSchema } from "./artists";

export const AlbumCreateSchema = z
  .object({
    title: z.string().min(1).max(255),
    artist_id: UuidSchema,
    cover_key: optionalCoverKeySchema(),
  })
  .openapi("AlbumCreate");

export const AlbumUpdateSchema = z
  .object({
    title: z.string().min(1).max(255).nullable().optional(),
    artist_id: nullableRef(UuidSchema).optional(),
    cover_key: optionalCoverKeySchema(),
  })
  .openapi("AlbumUpdate");

export function albumReadShape() {
  return {
    id: UuidSchema,
    title: z.string(),
    artist: ArtistReadSchema,
    cover_key: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    // Default no-None de Pydantic (`song_count: int = 0`).
    song_count: IntSchema.default(0),
    created_at: DateTimeSchema,
  };
}

export const AlbumReadSchema = z.object(albumReadShape()).openapi("AlbumRead");

export type AlbumRead = z.infer<typeof AlbumReadSchema>;
export type AlbumCreate = z.infer<typeof AlbumCreateSchema>;
export type AlbumUpdate = z.infer<typeof AlbumUpdateSchema>;
