/**
 * Endpoints de `/playlists` y `/me/playlists` (espejo de
 * `features/playlists/router.py`).
 *
 * ORDEN IMPORTANTE: las rutas estáticas (`/playlists/public`,
 * `/playlists/system`, `/playlists/system/{id}/refresh`, `/me/playlists/page`)
 * se registran ANTES de las parametrizadas para que ningún segmento fijo se
 * parsee como UUID (422).
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toMyPlaylistDto, toPlaylistDetailDto, toPlaylistDto, toSongDto } from "@/lib/serialize";
import { requireAdmin, requireUser } from "@/middleware/auth";
import {
  HTTPValidationErrorSchema,
  MyPlaylistReadSchema,
  PageMyPlaylistReadSchema,
  PagePlaylistReadSchema,
  PlaylistAddSongSchema,
  PlaylistCreateSchema,
  PlaylistDetailSchema,
  PlaylistReadSchema,
  PlaylistSystemCreateSchema,
  PlaylistUpdateSchema,
  UuidSchema,
} from "@/schemas";
import {
  addSongRecord,
  createPlaylistRecord,
  createSystemPlaylist,
  deletePlaylistRecord,
  getPlaylistDetail,
  listPlaylistsForUser,
  listPlaylistsForUserPage,
  listPublicCommunity,
  refreshSystemPlaylist,
  removeSongRecord,
  updatePlaylistRecord,
  type PlaylistDetailData,
} from "@/services/playlists";
import type { AppConfig } from "@/env";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const unauthorized = { description: "Missing token or inactive user." };
const forbidden = { description: "No tenés acceso a esta playlist" };
const adminForbidden = { description: "Requiere permisos de administrador" };
const notFound = { description: "Playlist o canción no encontrada" };

const playlistParams = z.object({ playlist_id: UuidSchema });
const playlistSongParams = z.object({
  playlist_id: UuidSchema,
  song_id: UuidSchema,
});

/** `bool` de FastAPI: acepta true/false/1/0/yes/no/on/off (case-insensitive). */
const listQuery = z.object({
  mine: z.stringbool().default(true),
});

/** Detalle serializado (playlist + canciones ordenadas por posición). */
function toDetailDto(detail: PlaylistDetailData, config: AppConfig) {
  return toPlaylistDetailDto(
    detail.playlist,
    config,
    detail.songs.map((song) => toSongDto(song, config)),
  );
}

const createSystemPlaylistRoute = createRoute({
  method: "post",
  path: "/playlists/system",
  tags: ["playlists"],
  summary: "Create System Playlist",
  description:
    "Genera una playlist del sistema (snapshot de una query) — admin only.",
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistSystemCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    401: unauthorized,
    403: adminForbidden,
    422: validationError,
  },
});

const refreshSystemPlaylistRoute = createRoute({
  method: "post",
  path: "/playlists/system/{playlist_id}/refresh",
  tags: ["playlists"],
  summary: "Refresh System Playlist",
  description:
    "Regenera el snapshot de una playlist del sistema — admin only.\n\n" +
    "Recalcula las canciones según la `query` que la generó (top_week, " +
    "top_month o new) y reemplaza el contenido en la misma playlist.",
  middleware: [requireAdmin] as const,
  request: { params: playlistParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    400: { description: "La playlist no se puede regenerar" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const listPublicPlaylistsRoute = createRoute({
  method: "get",
  path: "/playlists/public",
  tags: ["playlists"],
  summary: "List Public Playlists",
  description:
    "Feed público: playlists públicas de toda la comunidad (nuevas primero).\n\n" +
    "Público (sin sesión): son contenido visible para cualquiera por diseño.",
  request: { query: pageQuerySchema() },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PagePlaylistReadSchema } },
    },
    422: validationError,
  },
});

const listPlaylistsRoute = createRoute({
  method: "get",
  path: "/playlists",
  tags: ["playlists"],
  summary: "List Playlists",
  description: "Playlists del usuario actual (o las públicas del mismo perfil).",
  middleware: [requireUser] as const,
  request: { query: listQuery },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: z.array(PlaylistReadSchema) } },
    },
    401: unauthorized,
    422: validationError,
  },
});

const getPlaylistRoute = createRoute({
  method: "get",
  path: "/playlists/{playlist_id}",
  tags: ["playlists"],
  summary: "Get Playlist",
  description: "Detalle con canciones ordenadas (solo dueño o playlist pública).",
  middleware: [requireUser] as const,
  request: { params: playlistParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const createPlaylistRoute = createRoute({
  method: "post",
  path: "/playlists",
  tags: ["playlists"],
  summary: "Create Playlist",
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    401: unauthorized,
    422: validationError,
  },
});

const updatePlaylistRoute = createRoute({
  method: "patch",
  path: "/playlists/{playlist_id}",
  tags: ["playlists"],
  summary: "Update Playlist",
  description:
    "Actualiza solo los campos presentes en el body.\n\n" +
    "`description: null` y `cover_key: null` LIMPIAN el campo; " +
    "`name: null` e `is_public: null` son un NO-OP (no borran ni fallan: " +
    "ambas columnas son NOT NULL).",
  middleware: [requireUser] as const,
  request: {
    params: playlistParams,
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const deletePlaylistRoute = createRoute({
  method: "delete",
  path: "/playlists/{playlist_id}",
  tags: ["playlists"],
  summary: "Delete Playlist",
  middleware: [requireUser] as const,
  request: { params: playlistParams },
  responses: {
    204: { description: "Successful Response" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const addSongRoute = createRoute({
  method: "post",
  path: "/playlists/{playlist_id}/songs",
  tags: ["playlists"],
  summary: "Add Song To Playlist",
  middleware: [requireUser] as const,
  request: {
    params: playlistParams,
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistAddSongSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const removeSongRoute = createRoute({
  method: "delete",
  path: "/playlists/{playlist_id}/songs/{song_id}",
  tags: ["playlists"],
  summary: "Remove Song From Playlist",
  middleware: [requireUser] as const,
  request: { params: playlistSongParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const listMyPlaylistsRoute = createRoute({
  method: "get",
  path: "/me/playlists",
  tags: ["playlists"],
  summary: "List My Playlists",
  description:
    'Playlists del usuario actual (para el menú "agregar a playlist").\n\n' +
    "Incluye `song_ids` por playlist (orden por posición) para que el picker " +
    'muestre "Ya está en esta playlist" sin traer las canciones completas. ' +
    "Devuelve hasta 200 playlists (las más nuevas primero); el listado paginado " +
    "está en `/me/playlists/page`.",
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: z.array(MyPlaylistReadSchema) } },
    },
    401: unauthorized,
  },
});

const listMyPlaylistsPageRoute = createRoute({
  method: "get",
  path: "/me/playlists/page",
  tags: ["playlists"],
  summary: "List My Playlists Paginated",
  description:
    "Versión paginada para el listado /playlists de la app (Ver más).\n\n" +
    "`GET /me/playlists` (sin paginar) sigue trayendo TODAS las playlists del " +
    "usuario porque el PlaylistPicker las necesita enteras (suele ser < 50); " +
    "este endpoint solo lo usa el listado para acotar el primer render.",
  middleware: [requireUser] as const,
  request: { query: pageQuerySchema(20) },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageMyPlaylistReadSchema } },
    },
    401: unauthorized,
    422: validationError,
  },
});

export function registerPlaylistRoutes(app: OpenAPIHono<AppEnv>): void {
  // --- Estáticas primero ------------------------------------------------
  app.openapi(createSystemPlaylistRoute, async (c) => {
    const config = c.get("config");
    const detail = await createSystemPlaylist(
      config,
      c.get("user"),
      c.req.valid("json"),
    );
    return c.json(toDetailDto(detail, config), 201);
  });

  app.openapi(refreshSystemPlaylistRoute, async (c) => {
    const config = c.get("config");
    const detail = await refreshSystemPlaylist(
      config,
      c.get("user"),
      c.req.valid("param").playlist_id,
    );
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(listPublicPlaylistsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const page = await listPublicCommunity(config, offset, limit);
    return c.json(
      paginate(
        page.items.map((playlist) => toPlaylistDto(playlist, config)),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  app.openapi(listMyPlaylistsRoute, async (c) => {
    const config = c.get("config");
    const playlists = await listPlaylistsForUser(config, c.get("user"), false);
    return c.json(
      playlists.map((playlist) => toMyPlaylistDto(playlist, config)),
      200,
    );
  });

  app.openapi(listMyPlaylistsPageRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const page = await listPlaylistsForUserPage(config, c.get("user"), offset, limit);
    return c.json(
      paginate(
        page.items.map((playlist) => toMyPlaylistDto(playlist, config)),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  // --- Parametrizadas ---------------------------------------------------
  app.openapi(listPlaylistsRoute, async (c) => {
    const config = c.get("config");
    const { mine } = c.req.valid("query");
    const playlists = await listPlaylistsForUser(config, c.get("user"), !mine);
    return c.json(
      playlists.map((playlist) => toPlaylistDto(playlist, config)),
      200,
    );
  });

  app.openapi(createPlaylistRoute, async (c) => {
    const config = c.get("config");
    const detail = await createPlaylistRecord(
      config,
      c.get("user"),
      c.req.valid("json"),
    );
    return c.json(toDetailDto(detail, config), 201);
  });

  app.openapi(getPlaylistRoute, async (c) => {
    const config = c.get("config");
    const detail = await getPlaylistDetail(
      config,
      c.req.valid("param").playlist_id,
      c.get("user"),
    );
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(updatePlaylistRoute, async (c) => {
    const config = c.get("config");
    const detail = await updatePlaylistRecord(
      config,
      c.req.valid("param").playlist_id,
      c.get("user"),
      c.req.valid("json"),
    );
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(deletePlaylistRoute, async (c) => {
    const config = c.get("config");
    await deletePlaylistRecord(
      config,
      c.req.valid("param").playlist_id,
      c.get("user"),
    );
    return c.body(null, 204);
  });

  app.openapi(addSongRoute, async (c) => {
    const config = c.get("config");
    const { song_id } = c.req.valid("json");
    const detail = await addSongRecord(
      config,
      c.req.valid("param").playlist_id,
      c.get("user"),
      song_id,
    );
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(removeSongRoute, async (c) => {
    const config = c.get("config");
    const { playlist_id, song_id } = c.req.valid("param");
    const detail = await removeSongRecord(
      config,
      playlist_id,
      c.get("user"),
      song_id,
    );
    return c.json(toDetailDto(detail, config), 200);
  });
}
