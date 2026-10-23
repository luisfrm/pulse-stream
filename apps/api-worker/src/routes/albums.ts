/**
 * Endpoints de `/albums` (espejo de `features/albums/router.py`, sin el import
 * por ZIP que llega en la fase de uploads).
 *
 *   GET    /albums          -> listado público (Page<AlbumRead>, created_at desc)
 *   GET    /albums/{id}     -> AlbumDetail (álbum + canciones)
 *   POST   /albums          -> solo admin (201)
 *   PATCH  /albums/{id}     -> solo admin
 *   DELETE /albums/{id}     -> solo admin (204; 400 si tiene canciones)
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AlbumDetailData } from "@/services/albums";
import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toAlbumDetailDto, toAlbumDto, toSongDto } from "@/lib/serialize";
import { requireAdmin } from "@/middleware/auth";
import {
  AlbumCreateSchema,
  AlbumDetailSchema,
  AlbumUpdateSchema,
  HTTPValidationErrorSchema,
  PageAlbumReadSchema,
  UuidSchema,
} from "@/schemas";
import {
  createAlbumRecord,
  deleteAlbumRecord,
  getAlbumDetail,
  listAlbumPage,
  updateAlbumRecord,
} from "@/services/albums";
import type { AppConfig } from "@/env";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const unauthorized = { description: "Missing token or inactive user." };
const forbidden = { description: "Requiere permisos de administrador" };
const notFound = { description: "Álbum o artista no encontrado" };

const listQuery = pageQuerySchema().extend({
  q: z.string().max(255).optional().openapi({
    description: "Búsqueda por título",
  }),
  artist_id: UuidSchema.optional().openapi({
    description: "Filtrar por artista",
  }),
});

const albumParams = z.object({ album_id: UuidSchema });

/** `AlbumDetail` desde el agregado del service (álbum + canciones). */
function toDetailDto(detail: AlbumDetailData, config: AppConfig) {
  return toAlbumDetailDto(
    detail.album,
    config,
    detail.songs.map((song) => toSongDto(song, config)),
  );
}

const listAlbumsRoute = createRoute({
  method: "get",
  path: "/albums",
  tags: ["albums"],
  summary: "List Albums",
  request: { query: listQuery },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageAlbumReadSchema } },
    },
    422: validationError,
  },
});

const getAlbumRoute = createRoute({
  method: "get",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Get Album",
  request: { params: albumParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    404: notFound,
    422: validationError,
  },
});

const createAlbumRoute = createRoute({
  method: "post",
  path: "/albums",
  tags: ["albums"],
  summary: "Create Album",
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AlbumCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const updateAlbumRoute = createRoute({
  method: "patch",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Update Album",
  middleware: [requireAdmin] as const,
  request: {
    params: albumParams,
    body: {
      required: true,
      content: { "application/json": { schema: AlbumUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const deleteAlbumRoute = createRoute({
  method: "delete",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Delete Album",
  middleware: [requireAdmin] as const,
  request: { params: albumParams },
  responses: {
    204: { description: "Successful Response" },
    400: { description: "El álbum tiene canciones" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

export function registerAlbumRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listAlbumsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit, q, artist_id } = c.req.valid("query");
    const page = await listAlbumPage(
      config,
      { search: q, artistId: artist_id },
      offset,
      limit,
    );
    return c.json(
      paginate(
        page.items.map((album) => toAlbumDto(album, config)),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  app.openapi(getAlbumRoute, async (c) => {
    const config = c.get("config");
    const detail = await getAlbumDetail(config, c.req.valid("param").album_id);
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(createAlbumRoute, async (c) => {
    const config = c.get("config");
    const detail = await createAlbumRecord(config, c.req.valid("json"));
    return c.json(toDetailDto(detail, config), 201);
  });

  app.openapi(updateAlbumRoute, async (c) => {
    const config = c.get("config");
    const detail = await updateAlbumRecord(
      config,
      c.req.valid("param").album_id,
      c.req.valid("json"),
    );
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(deleteAlbumRoute, async (c) => {
    const config = c.get("config");
    await deleteAlbumRecord(config, c.req.valid("param").album_id);
    return c.body(null, 204);
  });
}
