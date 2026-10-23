/**
 * DTOs de canción (espejo de `features/songs/schemas.py`).
 *
 * `SongRead` no expone ids ni `cover_key`: el cover se hereda del álbum
 * (`cover_url`), y las relaciones van anidadas.
 */

import { z } from "@hono/zod-openapi";

import { DateTimeSchema, IntSchema, UuidSchema, nullableRef } from "./common";
import { AlbumReadSchema } from "./albums";
import { ArtistReadSchema } from "./artists";
import { SongGenreEnum } from "./genres";

/**
 * Tope de colaboradores por canción.
 *
 * No es un límite de negocio: acota el tamaño del body (y de la validación
 * `inArray`) para que un cliente no mande miles de ids. Python no lo tenía;
 * se documenta acá y se replica en el esquema de update.
 */
export const MAX_SONG_COLLABORATORS = 50;

const collaboratorIdsSchema = () =>
  z.array(UuidSchema).max(MAX_SONG_COLLABORATORS);

const SongCreateBase = z.object({
  title: z.string().min(1).max(255),
  // Se manda artist_id (existente) o artist_name (se crea inline).
  artist_id: nullableRef(UuidSchema).optional(),
  artist_name: z.string().min(1).max(255).nullable().optional(),
  // Obligatorio: toda canción vive en un álbum y hereda su cover.
  album_id: UuidSchema,
  genres: z.array(SongGenreEnum).optional(),
  lyrics: z.string().nullable().optional(),
  object_key: z.string().min(1).max(1024),
  duration_seconds: IntSchema.min(0).nullable().optional(),
  collaborator_ids: collaboratorIdsSchema().optional(),
});

export const SongCreateSchema = SongCreateBase.refine(
  (value) => Boolean(value.artist_id) || Boolean(value.artist_name),
  { message: "Se requiere artist_id o artist_name" },
).openapi("SongCreate");

export const SongUpdateSchema = z
  .object({
    title: z.string().min(1).max(255).nullable().optional(),
    artist_id: nullableRef(UuidSchema).optional(),
    // Reasignar a otro álbum sí; dejarlo en null responde 400 AlbumRequired.
    album_id: nullableRef(UuidSchema).optional(),
    genres: z.array(SongGenreEnum).nullable().optional(),
    lyrics: z.string().nullable().optional(),
    duration_seconds: IntSchema.min(0).nullable().optional(),
    // `null` explícito limpia el set (misma semántica que `[]` en Python).
    collaborator_ids: collaboratorIdsSchema().nullable().optional(),
  })
  .openapi("SongUpdate");

export function songReadShape() {
  return {
    id: UuidSchema,
    title: z.string(),
    artist: ArtistReadSchema,
    album: nullableRef(AlbumReadSchema).optional(),
    genres: z.array(SongGenreEnum).optional(),
    lyrics: z.string().nullable().optional(),
    object_key: z.string(),
    duration_seconds: IntSchema.nullable().optional(),
    // Default no-None de Pydantic (`play_count: int = 0`).
    play_count: IntSchema.default(0),
    created_at: DateTimeSchema,
    stream_url: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    collaborators: z.array(ArtistReadSchema).optional(),
  };
}

export const SongReadSchema = z.object(songReadShape()).openapi("SongRead");

/** Canción + métrica de reproducciones (ranking "populares"). */
export const SongWithPlaysSchema = z.object(songReadShape()).openapi("SongWithPlays").openapi({ description: "Canción + métrica de reproducciones (ranking \"populares\")." });

export type SongRead = z.infer<typeof SongReadSchema>;
export type SongCreate = z.infer<typeof SongCreateSchema>;
export type SongUpdate = z.infer<typeof SongUpdateSchema>;
export type SongWithPlays = z.infer<typeof SongWithPlaysSchema>;
