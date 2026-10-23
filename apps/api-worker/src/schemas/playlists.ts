/**
 * DTOs de playlist (espejo de `features/playlists/schemas.py`).
 */

import { z } from "@hono/zod-openapi";

import { DateTimeSchema, IntSchema, UuidSchema, nullableRef, optionalCoverKeySchema } from "./common";
import { SongReadSchema } from "./songs";

export const PlaylistKindEnum = z.enum(["user", "system"]).openapi("PlaylistKind");

/**
 * `kind` con el default de Pydantic (`kind = "user"`).
 *
 * OJO: no usar `PlaylistKindEnum.default("user")`. zod-to-openapi no puede
 * emitir `$ref` + `default` a la vez: el default termina pegado al componente
 * `PlaylistKind` (según el orden de generación) y el uso queda sin él. Un enum
 * inline conserva el default y produce el mismo tipo TS (`"user" | "system"`).
 */
const playlistKindWithDefault = () =>
  z.enum(PlaylistKindEnum.options).default("user");

export const PlaylistSystemQueryEnum = z
  .enum(["top_week", "top_month", "new"])
  .openapi("PlaylistSystemQuery");

export const PlaylistCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    // Default no-None de Pydantic (`is_public: bool = False`).
    is_public: z.boolean().default(false),
  })
  .openapi("PlaylistCreate");

export const PlaylistSystemCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    query: PlaylistSystemQueryEnum,
  })
  .openapi("PlaylistSystemCreate");

export const PlaylistUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).nullable().optional(),
    description: z.string().nullable().optional(),
    is_public: z.boolean().nullable().optional(),
    cover_key: optionalCoverKeySchema(),
  })
  .openapi("PlaylistUpdate");

export const PlaylistAddSongSchema = z
  .object({
    song_id: UuidSchema,
  })
  .openapi("PlaylistAddSong");

function playlistReadShape() {
  return {
    id: UuidSchema,
    // Defaults no-None de Pydantic: `kind = "user"`, `is_public = False`,
    // `song_count = 0`.
    kind: playlistKindWithDefault(),
    name: z.string(),
    description: z.string().nullable().optional(),
    is_public: z.boolean().default(false),
    cover_key: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    song_count: IntSchema.default(0),
    // Query de snapshot (solo system); NULL en playlists de usuario.
    query: nullableRef(PlaylistSystemQueryEnum).optional(),
    owner_email: z.string().nullable().optional(),
    created_at: DateTimeSchema,
  };
}

const PlaylistReadBase = z.object(playlistReadShape());

export const PlaylistReadSchema = PlaylistReadBase.openapi("PlaylistRead");

/** Playlist con sus canciones ordenadas por posición. */
export const PlaylistDetailSchema = z
  .object({
    ...playlistReadShape(),
    songs: z.array(SongReadSchema).optional(),
  })
  .openapi("PlaylistDetail");

/** Playlist del usuario para el PlaylistPicker (GET /me/playlists). */
export const MyPlaylistReadSchema = z
  .object({
    ...playlistReadShape(),
    song_ids: z.array(UuidSchema).optional(),
  })
  .openapi("MyPlaylistRead");

export type PlaylistKind = z.infer<typeof PlaylistKindEnum>;
export type PlaylistSystemQuery = z.infer<typeof PlaylistSystemQueryEnum>;
export type PlaylistRead = z.infer<typeof PlaylistReadSchema>;
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;
export type MyPlaylistRead = z.infer<typeof MyPlaylistReadSchema>;
export type PlaylistCreate = z.infer<typeof PlaylistCreateSchema>;
export type PlaylistUpdate = z.infer<typeof PlaylistUpdateSchema>;
export type PlaylistSystemCreate = z.infer<typeof PlaylistSystemCreateSchema>;
export type PlaylistAddSong = z.infer<typeof PlaylistAddSongSchema>;
