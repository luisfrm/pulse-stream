/**
 * DTOs de reproducciones (espejo de `features/listens/schemas.py`).
 */

import { z } from "@hono/zod-openapi";

import { DateTimeSchema, IntSchema, UuidSchema } from "./common";
import { songReadShape } from "./songs";

export const ListenCreateSchema = z
  .object({
    // El `user_id` lo da la sesión, nunca el body.
    song_id: UuidSchema,
  })
  .openapi("ListenCreate").openapi({ description: "Registro de una reproducción. El `user_id` lo da la sesión, no el body." });

export const ListenReadSchema = z
  .object({
    id: UuidSchema,
    song_id: UuidSchema,
    played_at: DateTimeSchema,
  })
  .openapi("ListenRead");

/** Canción del historial + cuántas veces la reprodujo el usuario. */
export const RecentlyPlayedSongSchema = z
  .object({
    ...songReadShape(),
    // Default no-None de Pydantic (`user_play_count: int = 0`).
    user_play_count: IntSchema.default(0),
  })
  .openapi("RecentlyPlayedSong").openapi({ description: "Canción del historial + cuántas veces la reprodujo el usuario." });

export type ListenCreate = z.infer<typeof ListenCreateSchema>;
export type ListenRead = z.infer<typeof ListenReadSchema>;
export type RecentlyPlayedSong = z.infer<typeof RecentlyPlayedSongSchema>;
