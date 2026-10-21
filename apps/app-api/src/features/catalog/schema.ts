import { z } from "@hono/zod-openapi";

/**
 * Contratos de lectura del catálogo (espejo EXACTO de los schemas de Python:
 * `ArtistRead`, `AlbumRead`, `SongRead`, `PlaylistRead`, `PlaylistDetail`,
 * `MyPlaylistRead`, `RecentlyPlayedSong`, `Page<T>`).
 *
 * Regla del repo: los enums de dominio viven acá (Zod), nunca en una columna
 * con tipo ENUM. Los valores de `SongGenre` son los de
 * `apps/api/app/features/genres/schemas.py`.
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

export const SongGenreSchema = z.enum(SONG_GENRES).openapi("SongGenre", {
  description: "Géneros permitidos (mismo set que valida el backend).",
});

export type SongGenre = z.infer<typeof SongGenreSchema>;

export const PlaylistKindSchema = z
  .enum(["user", "system"])
  .openapi("PlaylistKind", {
    description: "Tipo de playlist (columna VARCHAR plana).",
  });

export const PlaylistSystemQuerySchema = z
  .enum(["top_week", "top_month", "new"])
  .openapi("PlaylistSystemQuery", {
    description: "Snapshot que generó una playlist del sistema.",
  });

export const ArtistReadSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    image_url: z.string().nullable(),
    cover_key: z.string().nullable(),
    created_at: z.iso.datetime(),
    cover_url: z.string().nullable(),
  })
  .openapi("ArtistRead");

export const AlbumReadSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    artist: ArtistReadSchema,
    cover_key: z.string().nullable(),
    cover_url: z.string().nullable(),
    song_count: z.number().int(),
    created_at: z.iso.datetime(),
  })
  .openapi("AlbumRead");

/**
 * Campos de `SongRead`. Se comparte entre `SongRead`, `SongWithPlays` y
 * `RecentlyPlayedSong` (que agregan/renombran `play_count` sin cambiar el
 * resto del shape).
 */
function songReadShape() {
  return {
    id: z.uuid(),
    title: z.string(),
    artist: ArtistReadSchema,
    // `z.union([ref, null])` (no `.nullable()`): conserva el `$ref` + `null`
    // en OpenAPI 3.1 (`anyOf`); `.nullable()` sobre un schema referenciado
    // pierde la nulabilidad al generar el documento.
    album: z.union([AlbumReadSchema, z.null()]),
    genres: z.array(SongGenreSchema),
    lyrics: z.string().nullable(),
    object_key: z.string(),
    duration_seconds: z.number().int().nullable(),
    play_count: z.number().int(),
    created_at: z.iso.datetime(),
    stream_url: z.string().nullable(),
    cover_url: z.string().nullable(),
    collaborators: z.array(ArtistReadSchema),
  };
}

export const SongReadSchema = z.object(songReadShape()).openapi("SongRead");

export const SongWithPlaysSchema = z
  .object(songReadShape())
  .openapi("SongWithPlays", {
    description:
      "Canción + reproducciones en la ventana pedida (no el contador persistente).",
  });

export const RecentlyPlayedSongSchema = z
  .object({ ...songReadShape(), user_play_count: z.number().int() })
  .openapi("RecentlyPlayedSong");

export const PlaylistReadSchema = z
  .object({
    id: z.uuid(),
    kind: PlaylistKindSchema,
    name: z.string(),
    description: z.string().nullable(),
    is_public: z.boolean(),
    cover_key: z.string().nullable(),
    cover_url: z.string().nullable(),
    song_count: z.number().int(),
    // Igual que `album`: `z.union([ref, null])` para no perder la nulabilidad
    // del `$ref` en el OpenAPI.
    query: z.union([PlaylistSystemQuerySchema, z.null()]),
    owner_email: z.string().nullable(),
    created_at: z.iso.datetime(),
  })
  .openapi("PlaylistRead");

export const PlaylistDetailSchema = z
  .object({
    ...PlaylistReadSchema.shape,
    songs: z.array(SongReadSchema),
  })
  .openapi("PlaylistDetail");

export const AlbumDetailSchema = z
  .object({
    ...AlbumReadSchema.shape,
    songs: z.array(SongReadSchema),
  })
  .openapi("AlbumDetail");

export const MyPlaylistReadSchema = z
  .object({
    ...PlaylistReadSchema.shape,
    song_ids: z.array(z.uuid()),
  })
  .openapi("MyPlaylistRead");

export const LibraryIdsSchema = z
  .object({
    song_ids: z.array(z.uuid()),
    album_ids: z.array(z.uuid()),
    playlist_ids: z.array(z.uuid()),
  })
  .openapi("LibraryIds");

/** `Page<T>` de Python: `{items,total,offset,limit}`. */
export function pageSchema<T extends z.ZodType>(item: T, name: string) {
  return z
    .object({
      items: z.array(item),
      total: z.number().int(),
      offset: z.number().int(),
      limit: z.number().int(),
    })
    .openapi(name);
}

export const SongPageSchema = pageSchema(SongReadSchema, "SongPage");
export const AlbumPageSchema = pageSchema(AlbumReadSchema, "AlbumPage");
export const ArtistPageSchema = pageSchema(ArtistReadSchema, "ArtistPage");
export const PlaylistPageSchema = pageSchema(PlaylistReadSchema, "PlaylistPage");
export const MyPlaylistPageSchema = pageSchema(
  MyPlaylistReadSchema,
  "MyPlaylistPage",
);
export const RecentlyPlayedPageSchema = pageSchema(
  RecentlyPlayedSongSchema,
  "RecentlyPlayedPage",
);

export type ArtistRead = z.infer<typeof ArtistReadSchema>;
export type AlbumRead = z.infer<typeof AlbumReadSchema>;
export type SongRead = z.infer<typeof SongReadSchema>;
export type SongWithPlays = z.infer<typeof SongWithPlaysSchema>;
export type RecentlyPlayedSong = z.infer<typeof RecentlyPlayedSongSchema>;
export type PlaylistKind = z.infer<typeof PlaylistKindSchema>;
export type PlaylistSystemQuery = z.infer<typeof PlaylistSystemQuerySchema>;
export type PlaylistRead = z.infer<typeof PlaylistReadSchema>;
export type PlaylistDetail = z.infer<typeof PlaylistDetailSchema>;
export type AlbumDetail = z.infer<typeof AlbumDetailSchema>;
export type MyPlaylistRead = z.infer<typeof MyPlaylistReadSchema>;
export type LibraryIds = z.infer<typeof LibraryIdsSchema>;
export type Page<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};

/* -------------------------------------------------------------------------- */
/* Query params (mismos defaults/rangos que los `Query(...)` de FastAPI)      */
/* -------------------------------------------------------------------------- */

/** `bool` de query string: Python acepta "true"/"false"/"1"/"0". */
export const FlagQuerySchema = z.enum(["true", "false", "1", "0"]).optional();

const offsetSchema = z.coerce.number().int().min(0).default(0);
const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

export const ListSongsQuerySchema = z.object({
  offset: offsetSchema,
  limit: limitSchema,
  q: z.string().max(255).optional(),
  artist_id: z.uuid().optional(),
  collaborator_id: z.uuid().optional(),
  album_id: z.uuid().optional(),
  playlist_id: z.uuid().optional(),
});

export const PopularSongsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(365).default(30),
  month: FlagQuerySchema,
});

export const ListAlbumsQuerySchema = z.object({
  offset: offsetSchema,
  limit: limitSchema,
  q: z.string().max(255).optional(),
  artist_id: z.uuid().optional(),
});

export const ListArtistsQuerySchema = z.object({
  offset: offsetSchema,
  limit: limitSchema,
  q: z.string().max(255).optional(),
});

export const PageQuerySchema = z.object({
  offset: offsetSchema,
  limit: limitSchema,
});

export const ListPlaylistsQuerySchema = z.object({
  mine: FlagQuerySchema,
});

export const MyPlaylistsPageQuerySchema = z.object({
  offset: offsetSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SongParamsSchema = z.object({ song_id: z.uuid() });
export const AlbumParamsSchema = z.object({ album_id: z.uuid() });
export const ArtistParamsSchema = z.object({ artist_id: z.uuid() });
export const PlaylistParamsSchema = z.object({ playlist_id: z.uuid() });
