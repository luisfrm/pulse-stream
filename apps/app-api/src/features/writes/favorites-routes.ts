import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { ErrorSchema, NotFoundError } from "../../lib/errors";
import type { AppBindings } from "../../types";
import {
  AlbumParamsSchema,
  PlaylistParamsSchema,
  SongParamsSchema,
} from "../catalog/schema";
import {
  requireAlbum,
  requirePlaylistAccess,
  requireSong,
} from "../catalog/service";

/**
 * Likes de la app: canciones, álbumes y playlists.
 *
 * - `PUT` es idempotente (`ON CONFLICT DO NOTHING`): repetirlo sigue siendo
 *   204 y no duplica.
 * - `DELETE` responde 404 si el item no era favorito (mismo criterio que
 *   Python: `SongNotFoundError`/`AlbumNotFoundError`/`PlaylistNotFoundError`).
 * - El like de una playlist NO muta su contenido: solo marca el favorito.
 */

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorSchema } },
  };
}

const songParams = SongParamsSchema;
const albumParams = AlbumParamsSchema;
const playlistParams = PlaylistParamsSchema;

const addFavoriteSongRoute = createRoute({
  method: "put",
  path: "/me/favorites/{song_id}",
  tags: ["favorites"],
  summary: "Marca una canción como favorita",
  request: { params: songParams },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Favorito agregado (o ya existía)" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    404: errorResponse("Canción inexistente"),
  },
});

const removeFavoriteSongRoute = createRoute({
  method: "delete",
  path: "/me/favorites/{song_id}",
  tags: ["favorites"],
  summary: "Quita una canción de favoritos",
  request: { params: songParams },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Favorito quitado" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    404: errorResponse("La canción no era favorita"),
  },
});

const addFavoriteAlbumRoute = createRoute({
  method: "put",
  path: "/me/favorites/albums/{album_id}",
  tags: ["favorites"],
  summary: "Marca un álbum como favorito",
  request: { params: albumParams },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Favorito agregado (o ya existía)" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    404: errorResponse("Álbum inexistente"),
  },
});

const removeFavoriteAlbumRoute = createRoute({
  method: "delete",
  path: "/me/favorites/albums/{album_id}",
  tags: ["favorites"],
  summary: "Quita un álbum de favoritos",
  request: { params: albumParams },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Favorito quitado" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    404: errorResponse("El álbum no era favorito"),
  },
});

const addFavoritePlaylistRoute = createRoute({
  method: "put",
  path: "/me/favorites/playlists/{playlist_id}",
  tags: ["favorites"],
  summary: "Marca una playlist como favorita",
  description:
    "Pública de cualquiera o propia (privada incluida). Las `system` son siempre públicas y el like no las muta.",
  request: { params: playlistParams },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Favorito agregado (o ya existía)" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    403: errorResponse("Playlist privada de otro usuario"),
    404: errorResponse("Playlist inexistente"),
  },
});

const removeFavoritePlaylistRoute = createRoute({
  method: "delete",
  path: "/me/favorites/playlists/{playlist_id}",
  tags: ["favorites"],
  summary: "Quita una playlist de favoritos",
  request: { params: playlistParams },
  security: [{ sessionCookie: [] }],
  responses: {
    204: { description: "Favorito quitado" },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    404: errorResponse("La playlist no era favorita"),
  },
});

export function createFavoritesWriteRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(addFavoriteSongRoute, async (c) => {
    const { song_id: songId } = c.req.valid("param");
    const user = await requireUser(c);
    const catalog = c.get("catalog");

    requireSong(await catalog.getSongById(songId), songId);
    await c.get("writes").addFavoriteSong(user.id, songId);

    return c.body(null, 204);
  });

  app.openapi(removeFavoriteSongRoute, async (c) => {
    const { song_id: songId } = c.req.valid("param");
    const user = await requireUser(c);

    const removed = await c.get("writes").removeFavoriteSong(user.id, songId);
    if (!removed) throw new NotFoundError(`Canción ${songId} no existe`);

    return c.body(null, 204);
  });

  app.openapi(addFavoriteAlbumRoute, async (c) => {
    const { album_id: albumId } = c.req.valid("param");
    const user = await requireUser(c);
    const catalog = c.get("catalog");

    const detail = await catalog.getAlbumWithSongs(albumId);
    requireAlbum(detail?.album ?? null, albumId);
    await c.get("writes").addFavoriteAlbum(user.id, albumId);

    return c.body(null, 204);
  });

  app.openapi(removeFavoriteAlbumRoute, async (c) => {
    const { album_id: albumId } = c.req.valid("param");
    const user = await requireUser(c);

    const removed = await c.get("writes").removeFavoriteAlbum(user.id, albumId);
    if (!removed) throw new NotFoundError(`Álbum ${albumId} no existe`);

    return c.body(null, 204);
  });

  app.openapi(addFavoritePlaylistRoute, async (c) => {
    const { playlist_id: playlistId } = c.req.valid("param");
    const user = await requireUser(c);
    const catalog = c.get("catalog");

    const detail = await catalog.getPlaylistWithSongs(playlistId);
    const playlist = requirePlaylistAccess(
      detail?.playlist ?? null,
      playlistId,
      user,
    );
    await c.get("writes").addFavoritePlaylist(user.id, playlist.id);

    return c.body(null, 204);
  });

  app.openapi(removeFavoritePlaylistRoute, async (c) => {
    const { playlist_id: playlistId } = c.req.valid("param");
    const user = await requireUser(c);

    const removed = await c
      .get("writes")
      .removeFavoritePlaylist(user.id, playlistId);
    if (!removed) throw new NotFoundError(`Playlist ${playlistId} no existe`);

    return c.body(null, 204);
  });

  return app;
}
