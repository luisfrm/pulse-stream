/**
 * DTOs de artista (espejo de `features/artists/schemas.py`).
 * Los READ no validan el patrón de `cover_key`: hay filas legacy que deben
 * seguir leyéndose sin 500.
 */

import { z } from "@hono/zod-openapi";

import { DateTimeSchema, UuidSchema, optionalCoverKeySchema } from "./common";

export const ArtistReadSchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    image_url: z.string().nullable().optional(),
    cover_key: z.string().nullable().optional(),
    created_at: DateTimeSchema,
    cover_url: z.string().nullable().optional(),
  })
  .openapi("ArtistRead");

export const ArtistCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    image_url: z.string().nullable().optional(),
    cover_key: optionalCoverKeySchema(),
  })
  .openapi("ArtistCreate");

export const ArtistUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).nullable().optional(),
    image_url: z.string().nullable().optional(),
    cover_key: optionalCoverKeySchema(),
  })
  .openapi("ArtistUpdate");

export type ArtistRead = z.infer<typeof ArtistReadSchema>;
export type ArtistCreate = z.infer<typeof ArtistCreateSchema>;
export type ArtistUpdate = z.infer<typeof ArtistUpdateSchema>;
