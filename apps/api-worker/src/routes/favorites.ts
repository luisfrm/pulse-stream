/**
 * Endpoints de `/me/favorites*` y `/me/library/ids` (espejo de
 * `features/favorites/router.py`).
 *
 * ORDEN IMPORTANTE: `/me/favorites/{playlists,albums}/ids` y
 * `/me/favorites/ids` se registran ANTES de las rutas parametrizadas
 * (`/me/favorites/{song_id}`, `/me/favorites/playlists/{id}`, ...) para que
 * "ids"/"playlists"/"albums" no se parseen como UUID (422).
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toAlbumDto, toPlaylistDto, toSongDto } from "@/lib/serialize";
import { requireUser } from "@/middleware/auth";
import {
  AlbumReadSchema,
  HTTPValidationErrorSchema,
  PageAlbumReadSchema,
  PagePlaylistReadSchema,
  PageSongReadSchema,
  PlaylistReadSchema,
  SongReadSchema,
  UuidSchema,
} from "@/schemas";
import {
  addFavoriteAlbumRecord,
  addFavoritePlaylistRecord,
  addFavoriteSongRecord,
  favoriteAlbumIds,
  favoritePlaylistIds,
  favoriteSongIds,
  libraryIds,
  listFavoriteAlbumsPage,
  listFavoritePlaylistsPage,
  listFavoriteSongsPage,
  removeFavoriteAlbumRecord,
  removeFavoritePlaylistRecord,
  removeFavoriteSongRecord,
} from "@/services/favorites";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};


const songParams = z.object({ song_id: UuidSchema });
const playlistParams = z.object({ playlist_id: UuidSchema });
const albumParams = z.object({ album_id: UuidSchema });

const idsResponse = {
  description: "Successful Response",
  content: { "application/json": { schema: z.array(UuidSchema) } },
} as const;

const libraryIdsResponse = {
  description: "Successful Response",
  content: {
    "application/json": {
      /**
       * Python declara `dict[str, list[uuid.UUID]]` → `additionalProperties`
       * con `items: {type: string, format: uuid}`. Un `z.record` produce
       * exactamente eso, así que `openapi-typescript` genera el mismo
       * `{[key: string]: string[]}` que el contrato del backend Python.
       */
      schema: z.record(z.string(), z.array(UuidSchema)),
    },
  },
} as const;

// --- Canciones --------------------------------------------------------------

const listFavoritesRoute = createRoute({
  method: "get",
  path: "/me/favorites",
  tags: ["favorites"],
  summary: "List Favorites",
  operationId: "list_favorites_me_favorites_get",
  description: "Canciones favoritas del usuario (más recientes primero).",
  middleware: [requireUser] as const,
  request: { query: pageQuerySchema() },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageSongReadSchema } },
    },
    422: validationError,
  },
});

const favoriteIdsRoute = createRoute({
  method: "get",
  path: "/me/favorites/ids",
  tags: ["favorites"],
  summary: "Favorite Ids",
  operationId: "favorite_ids_me_favorites_ids_get",
  description: "IDs de canciones favoritas (para pintar corazones sin traer todo).",
  middleware: [requireUser] as const,
  responses: { 200: idsResponse },
});

const addFavoriteRoute = createRoute({
  method: "put",
  path: "/me/favorites/{song_id}",
  tags: ["favorites"],
  summary: "Add Favorite",
  operationId: "add_favorite_me_favorites__song_id__put",
  middleware: [requireUser] as const,
  request: { params: songParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

const removeFavoriteRoute = createRoute({
  method: "delete",
  path: "/me/favorites/{song_id}",
  tags: ["favorites"],
  summary: "Remove Favorite",
  operationId: "remove_favorite_me_favorites__song_id__delete",
  middleware: [requireUser] as const,
  request: { params: songParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

// --- Playlists favoritas ----------------------------------------------------

const listFavoritePlaylistsRoute = createRoute({
  method: "get",
  path: "/me/favorites/playlists",
  tags: ["favorites"],
  summary: "List Favorite Playlists",
  operationId: "list_favorite_playlists_me_favorites_playlists_get",
  description:
    "Playlists favoritas del usuario (de usuario y del sistema), más recientes primero.",
  middleware: [requireUser] as const,
  request: { query: pageQuerySchema() },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PagePlaylistReadSchema } },
    },
    422: validationError,
  },
});

const favoritePlaylistIdsRoute = createRoute({
  method: "get",
  path: "/me/favorites/playlists/ids",
  tags: ["favorites"],
  summary: "Favorite Playlist Ids",
  operationId: "favorite_playlist_ids_me_favorites_playlists_ids_get",
  description: "IDs de playlists favoritas (para pintar corazones sin traer todo).",
  middleware: [requireUser] as const,
  responses: { 200: idsResponse },
});

const addFavoritePlaylistRoute = createRoute({
  method: "put",
  path: "/me/favorites/playlists/{playlist_id}",
  tags: ["favorites"],
  summary: "Add Favorite Playlist",
  operationId: "add_favorite_playlist_me_favorites_playlists__playlist_id__put",
  description:
    "Like a una playlist (de usuario o del sistema).\n\n" +
    "Acción de usuario normal: NO muta el contenido de la playlist (las\n" +
    "`system` solo las muta un admin), solo la marca como favorita.",
  middleware: [requireUser] as const,
  request: { params: playlistParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

const removeFavoritePlaylistRoute = createRoute({
  method: "delete",
  path: "/me/favorites/playlists/{playlist_id}",
  tags: ["favorites"],
  summary: "Remove Favorite Playlist",
  operationId: "remove_favorite_playlist_me_favorites_playlists__playlist_id__delete",
  middleware: [requireUser] as const,
  request: { params: playlistParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

// --- Álbumes favoritos ------------------------------------------------------

const listFavoriteAlbumsRoute = createRoute({
  method: "get",
  path: "/me/favorites/albums",
  tags: ["favorites"],
  summary: "List Favorite Albums",
  operationId: "list_favorite_albums_me_favorites_albums_get",
  description: "Álbumes favoritos del usuario (más recientes primero).",
  middleware: [requireUser] as const,
  request: { query: pageQuerySchema() },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageAlbumReadSchema } },
    },
    422: validationError,
  },
});

const favoriteAlbumIdsRoute = createRoute({
  method: "get",
  path: "/me/favorites/albums/ids",
  tags: ["favorites"],
  summary: "Favorite Album Ids",
  operationId: "favorite_album_ids_me_favorites_albums_ids_get",
  description: "IDs de álbumes favoritos (para pintar corazones sin traer todo).",
  middleware: [requireUser] as const,
  responses: { 200: idsResponse },
});

const addFavoriteAlbumRoute = createRoute({
  method: "put",
  path: "/me/favorites/albums/{album_id}",
  tags: ["favorites"],
  summary: "Add Favorite Album",
  operationId: "add_favorite_album_me_favorites_albums__album_id__put",
  middleware: [requireUser] as const,
  request: { params: albumParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

const removeFavoriteAlbumRoute = createRoute({
  method: "delete",
  path: "/me/favorites/albums/{album_id}",
  tags: ["favorites"],
  summary: "Remove Favorite Album",
  operationId: "remove_favorite_album_me_favorites_albums__album_id__delete",
  middleware: [requireUser] as const,
  request: { params: albumParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

// --- Biblioteca consolidada -------------------------------------------------

const libraryIdsRoute = createRoute({
  method: "get",
  path: "/me/library/ids",
  tags: ["library"],
  summary: "Library Ids",
  operationId: "library_ids_me_library_ids_get",
  description:
    "Los 3 sets de likes del usuario en una sola llamada.\n\n" +
    "`{\"song_ids\": [...], \"album_ids\": [...], \"playlist_ids\": [...]}` — para\n" +
    "pintar corazones en la biblioteca sin traer las listas completas.",
  middleware: [requireUser] as const,
  responses: { 200: libraryIdsResponse },
});

export function registerFavoriteRoutes(app: OpenAPIHono<AppEnv>): void {
  // ORDEN = orden de las rutas en `favorites/router.py`: el documento OpenAPI
  // (y por lo tanto `generated.ts`) preserva el orden de los paths.
  app.openapi(listFavoritesRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const page = await listFavoriteSongsPage(config, c.get("user"), offset, limit);
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

  app.openapi(favoriteIdsRoute, async (c) => {
    const config = c.get("config");
    return c.json(await favoriteSongIds(config, c.get("user")), 200);
  });

  app.openapi(addFavoriteRoute, async (c) => {
    const config = c.get("config");
    await addFavoriteSongRecord(
      config,
      c.get("user"),
      c.req.valid("param").song_id,
    );
    return c.body(null, 204);
  });

  app.openapi(removeFavoriteRoute, async (c) => {
    const config = c.get("config");
    await removeFavoriteSongRecord(
      config,
      c.get("user"),
      c.req.valid("param").song_id,
    );
    return c.body(null, 204);
  });

  app.openapi(listFavoritePlaylistsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const page = await listFavoritePlaylistsPage(
      config,
      c.get("user"),
      offset,
      limit,
    );
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

  app.openapi(favoritePlaylistIdsRoute, async (c) => {
    const config = c.get("config");
    return c.json(await favoritePlaylistIds(config, c.get("user")), 200);
  });

  app.openapi(addFavoritePlaylistRoute, async (c) => {
    const config = c.get("config");
    await addFavoritePlaylistRecord(
      config,
      c.get("user"),
      c.req.valid("param").playlist_id,
    );
    return c.body(null, 204);
  });

  app.openapi(removeFavoritePlaylistRoute, async (c) => {
    const config = c.get("config");
    await removeFavoritePlaylistRecord(
      config,
      c.get("user"),
      c.req.valid("param").playlist_id,
    );
    return c.body(null, 204);
  });

  app.openapi(listFavoriteAlbumsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const page = await listFavoriteAlbumsPage(config, c.get("user"), offset, limit);
    return c.json(
      paginate(
        page.items.map(({ album, artist, songCount }) =>
          toAlbumDto({ ...album, artist, songCount }, config),
        ),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  app.openapi(favoriteAlbumIdsRoute, async (c) => {
    const config = c.get("config");
    return c.json(await favoriteAlbumIds(config, c.get("user")), 200);
  });

  app.openapi(addFavoriteAlbumRoute, async (c) => {
    const config = c.get("config");
    await addFavoriteAlbumRecord(
      config,
      c.get("user"),
      c.req.valid("param").album_id,
    );
    return c.body(null, 204);
  });

  app.openapi(removeFavoriteAlbumRoute, async (c) => {
    const config = c.get("config");
    await removeFavoriteAlbumRecord(
      config,
      c.get("user"),
      c.req.valid("param").album_id,
    );
    return c.body(null, 204);
  });

  app.openapi(libraryIdsRoute, async (c) => {
    const config = c.get("config");
    const ids = await libraryIds(config, c.get("user"));
    return c.json(
      {
        song_ids: ids.songIds,
        album_ids: ids.albumIds,
        playlist_ids: ids.playlistIds,
      },
      200,
    );
  });
}
