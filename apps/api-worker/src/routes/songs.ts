/**
 * Endpoints de `/songs` (espejo de `features/songs/router.py`).
 *
 *   GET    /songs          -> listado público (Page<SongRead>)
 *   GET    /songs/popular  -> ranking por reproducciones (DEBE registrarse
 *                             antes de /songs/{song_id})
 *   GET    /songs/{id}     -> detalle público
 *   POST   /songs          -> solo admin (201)
 *   PATCH  /songs/{id}     -> solo admin
 *   DELETE /songs/{id}     -> solo admin (204)
 *
 * PARIDAD DE CONTRATO: `responses` = éxito + 422 (como Python) y los query
 * params opcionales son nullable (`str | None = Query(None)`), para que
 * `pnpm gen:types:worker` no cambie `generated.ts`.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toSongDto, toSongWithPlaysDto } from "@/lib/serialize";
import { requireAdmin } from "@/middleware/auth";
import {
  HTTPValidationErrorSchema,
  PageSongReadSchema,
  SongCreateSchema,
  SongReadSchema,
  SongUpdateSchema,
  SongWithPlaysSchema,
  UuidSchema,
  queryBool,
  queryInt,
} from "@/schemas";
import {
  createSongRecord,
  deleteSongRecord,
  getSongOr404,
  listPopularSongs,
  listSongPage,
  updateSongRecord,
} from "@/services/songs";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const listQuery = pageQuerySchema().extend({
  q: z.string().max(255).nullable().optional().openapi({
    description: "Búsqueda por título",
  }),
  artist_id: UuidSchema.nullable().optional().openapi({
    description: "Filtrar por artista",
  }),
  collaborator_id: UuidSchema.nullable().optional().openapi({
    description: "Filtrar por artista colaborador (no principal)",
  }),
  album_id: UuidSchema.nullable().optional().openapi({
    // Mismo texto que el router Python (incluido el "en orden de posición").
    description: "Filtrar por álbum (en orden de posición)",
  }),
  playlist_id: UuidSchema.nullable().optional().openapi({
    description: "Filtrar por playlist (en orden de posición)",
  }),
});

const popularQuery = z.object({
  limit: queryInt({ min: 1, max: 50, default: 10 }),
  days: queryInt({
    min: 1,
    max: 365,
    default: 30,
    description: "Ventana móvil en días",
  }),
  month: queryBool({
    default: false,
    description: "Usar el mes calendario actual (UTC) en vez de `days`",
  }),
});

const songParams = z.object({ song_id: UuidSchema });

const listSongsRoute = createRoute({
  method: "get",
  path: "/songs",
  tags: ["songs"],
  summary: "List Songs",
  operationId: "list_songs_songs_get",
  request: { query: listQuery },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageSongReadSchema } },
    },
    422: validationError,
  },
});

const popularSongsRoute = createRoute({
  method: "get",
  path: "/songs/popular",
  tags: ["songs"],
  summary: "Popular Songs",
  operationId: "popular_songs_songs_popular_get",
  description:
    "Top canciones por reproducciones en una ventana (días o mes actual).",
  request: { query: popularQuery },
  responses: {
    200: {
      description: "Successful Response",
      content: {
        "application/json": { schema: z.array(SongWithPlaysSchema) },
      },
    },
    422: validationError,
  },
});

const getSongRoute = createRoute({
  method: "get",
  path: "/songs/{song_id}",
  tags: ["songs"],
  summary: "Get Song",
  operationId: "get_song_songs__song_id__get",
  request: { params: songParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: SongReadSchema } },
    },
    422: validationError,
  },
});

const createSongRoute = createRoute({
  method: "post",
  path: "/songs",
  tags: ["songs"],
  summary: "Create Song",
  operationId: "create_song_songs_post",
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SongCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: SongReadSchema } },
    },
    422: validationError,
  },
});

const updateSongRoute = createRoute({
  method: "patch",
  path: "/songs/{song_id}",
  tags: ["songs"],
  summary: "Update Song",
  operationId: "update_song_songs__song_id__patch",
  middleware: [requireAdmin] as const,
  request: {
    params: songParams,
    body: {
      required: true,
      content: { "application/json": { schema: SongUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: SongReadSchema } },
    },
    422: validationError,
  },
});

const deleteSongRoute = createRoute({
  method: "delete",
  path: "/songs/{song_id}",
  tags: ["songs"],
  summary: "Delete Song",
  operationId: "delete_song_songs__song_id__delete",
  middleware: [requireAdmin] as const,
  request: { params: songParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

export function registerSongRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listSongsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit, q, artist_id, collaborator_id, album_id, playlist_id } =
      c.req.valid("query");
    const page = await listSongPage(
      config,
      {
        search: q,
        artistId: artist_id,
        collaboratorId: collaborator_id,
        albumId: album_id,
        playlistId: playlist_id,
      },
      offset,
      limit,
    );
    return c.json(
      paginate(
        page.items.map((song) => toSongDto(song, config)),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  // Antes de `/{song_id}`: si no, "popular" se parsea como uuid y da 422.
  app.openapi(popularSongsRoute, async (c) => {
    const config = c.get("config");
    const { limit, days, month } = c.req.valid("query");
    const ranking = await listPopularSongs(config, { limit, days, month });
    return c.json(
      ranking.map(({ song, plays }) => toSongWithPlaysDto(song, config, plays)),
      200,
    );
  });

  app.openapi(getSongRoute, async (c) => {
    const config = c.get("config");
    const song = await getSongOr404(config, c.req.valid("param").song_id);
    return c.json(toSongDto(song, config), 200);
  });

  app.openapi(createSongRoute, async (c) => {
    const config = c.get("config");
    const song = await createSongRecord(config, c.req.valid("json"));
    return c.json(toSongDto(song, config), 201);
  });

  app.openapi(updateSongRoute, async (c) => {
    const config = c.get("config");
    const song = await updateSongRecord(
      config,
      c.req.valid("param").song_id,
      c.req.valid("json"),
    );
    return c.json(toSongDto(song, config), 200);
  });

  app.openapi(deleteSongRoute, async (c) => {
    const config = c.get("config");
    await deleteSongRecord(config, c.req.valid("param").song_id);
    return c.body(null, 204);
  });
}
