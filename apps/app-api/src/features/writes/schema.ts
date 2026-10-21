import { z } from "@hono/zod-openapi";

/**
 * Contratos de escritura (espejo de los schemas de Python de
 * `playlists/schemas.py` y `listens/schemas.py`).
 */

/** `PlaylistCreate`: name 1..255; `is_public` default false. */
export const PlaylistCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .openapi("PlaylistCreate");

/** `PlaylistUpdate`: todos opcionales; solo se persisten los enviados. */
export const PlaylistUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().nullable().optional(),
    is_public: z.boolean().optional(),
    // Solo keys del presign: rechaza el bypass por PATCH directo.
    cover_key: z
      .string()
      .regex(/^covers\/[0-9a-f-]+\.webp$/)
      .nullable()
      .optional(),
  })
  .openapi("PlaylistUpdate");

export const PlaylistAddSongSchema = z
  .object({ song_id: z.uuid() })
  .openapi("PlaylistAddSong");

export const PlaylistSongParamsSchema = z.object({
  playlist_id: z.uuid(),
  song_id: z.uuid(),
});

/** `ListenCreate`: el dueño lo da la sesión, nunca el body. */
export const ListenCreateSchema = z
  .object({ song_id: z.uuid() })
  .openapi("ListenCreate");

/** `ListenRead` (contrato de Python). */
export const ListenReadSchema = z
  .object({
    id: z.uuid(),
    song_id: z.uuid(),
    played_at: z.iso.datetime(),
  })
  .openapi("ListenRead");

export type PlaylistCreate = z.infer<typeof PlaylistCreateSchema>;
export type PlaylistUpdate = z.infer<typeof PlaylistUpdateSchema>;
export type PlaylistAddSong = z.infer<typeof PlaylistAddSongSchema>;
export type ListenCreate = z.infer<typeof ListenCreateSchema>;
export type ListenRead = z.infer<typeof ListenReadSchema>;
