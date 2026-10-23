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

const unauthorized = { description: "Missing token or inactive user." };
const forbidden = { description: "Requiere permisos de administrador" };
const notFound = { description: "Canción no encontrada" };

const listQuery = pageQuerySchema().extend({
  q: z.string().max(255).optional().openapi({
    description: "Búsqueda por título",
  }),
  artist_id: UuidSchema.optional().openapi({ description: "Filtrar por artista" }),
  collaborator_id: UuidSchema.optional().openapi({
    description: "Filtrar por artista colaborador (no principal)",
  }),
  album_id: UuidSchema.optional().openapi({
    // Mismo texto que el router Python (incluido el "en orden de posición").
    description: "Filtrar por álbum (en orden de posición)",
  }),
  playlist_id: UuidSchema.optional().openapi({
    description: "Filtrar por playlist (en orden de posición)",
  }),
});

/** `bool` de FastAPI: acepta true/false/1/0/yes/no/on/off (case-insensitive). */
const popularQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(365).default(30).openapi({
    description: "Ventana móvil en días",
  }),
  month: z.stringbool().default(false).openapi({
    description: "Usar el mes calendario actual (UTC) en vez de `days`",
  }),
});

const songParams = z.object({ song_id: UuidSchema });

const listSongsRoute = createRoute({
  method: "get",
  path: "/songs",
  tags: ["songs"],
  summary: "List Songs",
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
  description: "Top canciones por reproducciones en una ventana (días o mes actual).",
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
  request: { params: songParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: SongReadSchema } },
    },
    404: notFound,
    422: validationError,
  },
});

const createSongRoute = createRoute({
  method: "post",
  path: "/songs",
  tags: ["songs"],
  summary: "Create Song",
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
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const updateSongRoute = createRoute({
  method: "patch",
  path: "/songs/{song_id}",
  tags: ["songs"],
  summary: "Update Song",
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
    400: { description: "La canción requiere un álbum" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const deleteSongRoute = createRoute({
  method: "delete",
  path: "/songs/{song_id}",
  tags: ["songs"],
  summary: "Delete Song",
  middleware: [requireAdmin] as const,
  request: { params: songParams },
  responses: {
    204: { description: "Successful Response" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
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
