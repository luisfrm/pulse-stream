/**
 * Endpoints de `/artists` (espejo de `features/artists/router.py`).
 *
 *   GET    /artists          -> listado público (Page<ArtistRead>, name asc)
 *   GET    /artists/{id}     -> detalle público
 *   POST   /artists          -> solo admin (201)
 *   PATCH  /artists/{id}     -> solo admin
 *   DELETE /artists/{id}     -> solo admin (204, cascada en DB)
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toArtistDto } from "@/lib/serialize";
import { requireAdmin } from "@/middleware/auth";
import {
  ArtistCreateSchema,
  ArtistReadSchema,
  ArtistUpdateSchema,
  HTTPValidationErrorSchema,
  PageArtistReadSchema,
  UuidSchema,
} from "@/schemas";
import {
  createArtistRecord,
  deleteArtistRecord,
  getArtistOr404,
  listArtistPage,
  updateArtistRecord,
} from "@/services/artists";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const unauthorized = { description: "Missing token or inactive user." };
const forbidden = { description: "Requiere permisos de administrador" };
const notFound = { description: "Artista no encontrado" };

const listQuery = pageQuerySchema().extend({
  q: z.string().max(255).optional().openapi({
    description: "Búsqueda por nombre",
  }),
});

const artistParams = z.object({ artist_id: UuidSchema });

const listArtistsRoute = createRoute({
  method: "get",
  path: "/artists",
  tags: ["artists"],
  summary: "List Artists",
  request: { query: listQuery },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageArtistReadSchema } },
    },
    422: validationError,
  },
});

const getArtistRoute = createRoute({
  method: "get",
  path: "/artists/{artist_id}",
  tags: ["artists"],
  summary: "Get Artist",
  request: { params: artistParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: ArtistReadSchema } },
    },
    404: notFound,
    422: validationError,
  },
});

const createArtistRoute = createRoute({
  method: "post",
  path: "/artists",
  tags: ["artists"],
  summary: "Create Artist",
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ArtistCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: ArtistReadSchema } },
    },
    401: unauthorized,
    403: forbidden,
    409: { description: "Ya existe un artista con ese nombre" },
    422: validationError,
  },
});

const updateArtistRoute = createRoute({
  method: "patch",
  path: "/artists/{artist_id}",
  tags: ["artists"],
  summary: "Update Artist",
  middleware: [requireAdmin] as const,
  request: {
    params: artistParams,
    body: {
      required: true,
      content: { "application/json": { schema: ArtistUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: ArtistReadSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    409: { description: "Ya existe un artista con ese nombre" },
    422: validationError,
  },
});

const deleteArtistRoute = createRoute({
  method: "delete",
  path: "/artists/{artist_id}",
  tags: ["artists"],
  summary: "Delete Artist",
  middleware: [requireAdmin] as const,
  request: { params: artistParams },
  responses: {
    204: { description: "Successful Response" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

export function registerArtistRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listArtistsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit, q } = c.req.valid("query");
    const page = await listArtistPage(config, offset, limit, q);
    return c.json(
      paginate(
        page.items.map((artist) => toArtistDto(artist, config)),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  app.openapi(getArtistRoute, async (c) => {
    const config = c.get("config");
    const artist = await getArtistOr404(config, c.req.valid("param").artist_id);
    return c.json(toArtistDto(artist, config), 200);
  });

  app.openapi(createArtistRoute, async (c) => {
    const config = c.get("config");
    const artist = await createArtistRecord(config, c.req.valid("json"));
    return c.json(toArtistDto(artist, config), 201);
  });

  app.openapi(updateArtistRoute, async (c) => {
    const config = c.get("config");
    const artist = await updateArtistRecord(
      config,
      c.req.valid("param").artist_id,
      c.req.valid("json"),
    );
    return c.json(toArtistDto(artist, config), 200);
  });

  app.openapi(deleteArtistRoute, async (c) => {
    const config = c.get("config");
    await deleteArtistRecord(config, c.req.valid("param").artist_id);
    return c.body(null, 204);
  });
}
