import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { ErrorSchema, NotFoundError } from "../../lib/errors";
import type { AppBindings } from "../../types";
import { PlaylistDetailSchema, PlaylistParamsSchema } from "../catalog/schema";
import { requireSong } from "../catalog/service";
import type { UpdatePlaylistFields, WritesRepository } from "./repository";
import {
  PlaylistAddSongSchema,
  PlaylistCreateSchema,
  PlaylistSongParamsSchema,
  PlaylistUpdateSchema,
} from "./schema";
import { loadPlaylistDetail, requireMutablePlaylist } from "./service";

/**
 * Playlists de usuario (la app no crea/muta `system`: eso es del panel).
 *
 * Reglas (espejo de la API del panel):
 * - solo el dueño muta (403; 404 si no existe);
 * - las playlists `system` NO las muta ningún usuario de la app (las gestiona
 *   el panel contra Python), ni siquiera un admin legacy;
 * - agregar una canción ya presente es no-op; quitar una ausente es 404;
 * - las mutaciones devuelven el `PlaylistDetail` completo (orden `position`).
 */

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorSchema } },
  };
}

const createPlaylistRoute = createRoute({
  method: "post",
  path: "/playlists",
  tags: ["playlists"],
  summary: "Crea una playlist del usuario",
  description: "`kind='user'`, dueño = sesión, sin canciones.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistCreateSchema } },
    },
  },
  security: [{ sessionCookie: [] }],
  responses: {
    201: {
      description: "Playlist creada",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    400: errorResponse("Body inválido"),
    401: errorResponse("Sin sesión válida"),
  },
});

const updatePlaylistRoute = createRoute({
  method: "patch",
  path: "/playlists/{playlist_id}",
  tags: ["playlists"],
  summary: "Edita una playlist",
  request: {
    params: PlaylistParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistUpdateSchema } },
    },
  },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Playlist actualizada",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    400: errorResponse("ID o body inválido"),
    401: errorResponse("Sin sesión válida"),
    403: errorResponse("No es el dueño o es una playlist del sistema"),
    404: errorResponse("Playlist inexistente"),
  },
});

const deletePlaylistRoute = createRoute({
  method: "delete",
  path: "/playlists/{playlist_id}",
  tags: ["playlists"],
  summary: "Borra una playlist",
  request: { params: PlaylistParamsSchema },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Playlist borrada" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    403: errorResponse("No es el dueño o es una playlist del sistema"),
    404: errorResponse("Playlist inexistente"),
  },
});

const addPlaylistSongRoute = createRoute({
  method: "post",
  path: "/playlists/{playlist_id}/songs",
  tags: ["playlists"],
  summary: "Agrega una canción al final de la playlist",
  description:
    "Posición = `max(position)+1`. Si la canción ya estaba, no-op (200 con el detalle).",
  request: {
    params: PlaylistParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: PlaylistAddSongSchema } },
    },
  },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Playlist actualizada",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    400: errorResponse("ID o body inválido"),
    401: errorResponse("Sin sesión válida"),
    403: errorResponse("No es el dueño o es una playlist del sistema"),
    404: errorResponse("Playlist o canción inexistente"),
  },
});

const removePlaylistSongRoute = createRoute({
  method: "delete",
  path: "/playlists/{playlist_id}/songs/{song_id}",
  tags: ["playlists"],
  summary: "Quita una canción y renumera la playlist",
  request: { params: PlaylistSongParamsSchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Playlist actualizada",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    403: errorResponse("No es el dueño o es una playlist del sistema"),
    404: errorResponse("Playlist inexistente o canción que no estaba"),
  },
});

/** Campos enviados (los ausentes no se tocan; `null` limpia description/cover). */
function playlistUpdateFields(
  payload: {
    name?: string;
    description?: string | null;
    is_public?: boolean;
    cover_key?: string | null;
  },
): UpdatePlaylistFields {
  const fields: UpdatePlaylistFields = {};
  if (payload.name !== undefined) fields.name = payload.name;
  if (payload.description !== undefined) {
    fields.description = payload.description;
  }
  if (payload.is_public !== undefined) fields.isPublic = payload.is_public;
  if (payload.cover_key !== undefined) fields.coverKey = payload.cover_key;
  return fields;
}

async function applyPlaylistUpdate(
  writes: WritesRepository,
  playlistId: string,
  fields: UpdatePlaylistFields,
): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await writes.updatePlaylist(playlistId, fields);
}

export function createPlaylistsWriteRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(createPlaylistRoute, async (c) => {
    const payload = c.req.valid("json");
    const user = await requireUser(c);
    const playlistId = await c.get("writes").createPlaylist({
      ownerId: user.id,
      name: payload.name,
      description: payload.description ?? null,
      isPublic: payload.is_public ?? false,
      kind: "user",
      query: null,
    });

    const detail = await loadPlaylistDetail(
      c.get("catalog"),
      playlistId,
      user,
      c.get("config").r2PublicBaseUrl,
    );
    return c.json(detail, 201);
  });

  app.openapi(updatePlaylistRoute, async (c) => {
    const { playlist_id: playlistId } = c.req.valid("param");
    const payload = c.req.valid("json");
    const user = await requireUser(c);
    const catalog = c.get("catalog");

    await requireMutablePlaylist(catalog, playlistId, user);
    await applyPlaylistUpdate(
      c.get("writes"),
      playlistId,
      playlistUpdateFields(payload),
    );

    const detail = await loadPlaylistDetail(
      catalog,
      playlistId,
      user,
      c.get("config").r2PublicBaseUrl,
    );
    return c.json(detail, 200);
  });

  app.openapi(deletePlaylistRoute, async (c) => {
    const { playlist_id: playlistId } = c.req.valid("param");
    const user = await requireUser(c);

    await requireMutablePlaylist(c.get("catalog"), playlistId, user);
    await c.get("writes").deletePlaylist(playlistId);

    return c.body(null, 204);
  });

  app.openapi(addPlaylistSongRoute, async (c) => {
    const { playlist_id: playlistId } = c.req.valid("param");
    const { song_id: songId } = c.req.valid("json");
    const user = await requireUser(c);
    const catalog = c.get("catalog");

    await requireMutablePlaylist(catalog, playlistId, user);
    requireSong(await catalog.getSongById(songId), songId);
    await c.get("writes").addPlaylistSong(playlistId, songId);

    const detail = await loadPlaylistDetail(
      catalog,
      playlistId,
      user,
      c.get("config").r2PublicBaseUrl,
    );
    return c.json(detail, 200);
  });

  app.openapi(removePlaylistSongRoute, async (c) => {
    const { playlist_id: playlistId, song_id: songId } = c.req.valid("param");
    const user = await requireUser(c);
    const catalog = c.get("catalog");

    await requireMutablePlaylist(catalog, playlistId, user);
    const removed = await c
      .get("writes")
      .removePlaylistSong(playlistId, songId);
    if (!removed) throw new NotFoundError(`Canción ${songId} no existe`);

    const detail = await loadPlaylistDetail(
      catalog,
      playlistId,
      user,
      c.get("config").r2PublicBaseUrl,
    );
    return c.json(detail, 200);
  });

  return app;
}
