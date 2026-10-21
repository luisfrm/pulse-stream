import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { ErrorSchema } from "../../lib/errors";
import type { AppBindings } from "../../types";
import {
  mapAlbum,
  mapMyPlaylist,
  mapPlaylist,
  mapRecentlyPlayed,
  mapSong,
} from "./mappers";
import {
  AlbumPageSchema,
  LibraryIdsSchema,
  MyPlaylistPageSchema,
  MyPlaylistReadSchema,
  MyPlaylistsPageQuerySchema,
  PageQuerySchema,
  PlaylistPageSchema,
  RecentlyPlayedPageSchema,
  SongPageSchema,
} from "./schema";
import { pageOf } from "./service";

/**
 * Lecturas por usuario (`/me/*`): biblioteca, favoritos, playlists y
 * recientes. Todas exigen sesión, NUNCA se cachean y usan `cache: no-store`
 * del lado del front.
 */

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorSchema } },
  };
}

const sessionResponses = {
  401: errorResponse("Sin sesión válida"),
};

const listFavoritesRoute = createRoute({
  method: "get",
  path: "/me/favorites",
  tags: ["favorites"],
  summary: "Canciones favoritas",
  request: { query: PageQuerySchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Página de canciones favoritas (like más reciente primero)",
      content: { "application/json": { schema: SongPageSchema } },
    },
    400: errorResponse("Query inválida"),
    ...sessionResponses,
  },
});

const favoriteIdsRoute = createRoute({
  method: "get",
  path: "/me/favorites/ids",
  tags: ["favorites"],
  summary: "IDs de canciones favoritas",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "UUIDs ordenados",
      content: { "application/json": { schema: z.array(z.uuid()) } },
    },
    ...sessionResponses,
  },
});

const listFavoriteAlbumsRoute = createRoute({
  method: "get",
  path: "/me/favorites/albums",
  tags: ["favorites"],
  summary: "Álbumes favoritos",
  request: { query: PageQuerySchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Página de álbumes favoritos (con `song_count` real)",
      content: { "application/json": { schema: AlbumPageSchema } },
    },
    400: errorResponse("Query inválida"),
    ...sessionResponses,
  },
});

const favoriteAlbumIdsRoute = createRoute({
  method: "get",
  path: "/me/favorites/albums/ids",
  tags: ["favorites"],
  summary: "IDs de álbumes favoritos",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "UUIDs ordenados",
      content: { "application/json": { schema: z.array(z.uuid()) } },
    },
    ...sessionResponses,
  },
});

const listFavoritePlaylistsRoute = createRoute({
  method: "get",
  path: "/me/favorites/playlists",
  tags: ["favorites"],
  summary: "Playlists favoritas",
  request: { query: PageQuerySchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Página de playlists favoritas",
      content: { "application/json": { schema: PlaylistPageSchema } },
    },
    400: errorResponse("Query inválida"),
    ...sessionResponses,
  },
});

const favoritePlaylistIdsRoute = createRoute({
  method: "get",
  path: "/me/favorites/playlists/ids",
  tags: ["favorites"],
  summary: "IDs de playlists favoritas",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "UUIDs ordenados",
      content: { "application/json": { schema: z.array(z.uuid()) } },
    },
    ...sessionResponses,
  },
});

const libraryIdsRoute = createRoute({
  method: "get",
  path: "/me/library/ids",
  tags: ["library"],
  summary: "Los 3 sets de likes del usuario",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "`{song_ids, album_ids, playlist_ids}` ordenados",
      content: { "application/json": { schema: LibraryIdsSchema } },
    },
    ...sessionResponses,
  },
});

const listMyPlaylistsRoute = createRoute({
  method: "get",
  path: "/me/playlists",
  tags: ["playlists"],
  summary: "Mis playlists (con `song_ids`)",
  description:
    "Todas las playlists del usuario con `song_ids` en orden de posición (PlaylistPicker).",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Playlists del usuario",
      content: {
        "application/json": { schema: z.array(MyPlaylistReadSchema) },
      },
    },
    ...sessionResponses,
  },
});

const listMyPlaylistsPageRoute = createRoute({
  method: "get",
  path: "/me/playlists/page",
  tags: ["playlists"],
  summary: "Mis playlists (paginadas)",
  request: { query: MyPlaylistsPageQuerySchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Página de playlists del usuario",
      content: { "application/json": { schema: MyPlaylistPageSchema } },
    },
    400: errorResponse("Query inválida"),
    ...sessionResponses,
  },
});

const recentlyPlayedRoute = createRoute({
  method: "get",
  path: "/me/recently-played",
  tags: ["listens"],
  summary: "Canciones escuchadas recientemente",
  description:
    "Sin duplicados, último play primero. Cada item trae `user_play_count`.",
  request: { query: PageQuerySchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Página de recientes",
      content: { "application/json": { schema: RecentlyPlayedPageSchema } },
    },
    400: errorResponse("Query inválida"),
    ...sessionResponses,
  },
});

export function createCatalogMeRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(listFavoritesRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const result = await c.get("catalog").listFavoriteSongs({
      userId: user.id,
      offset: query.offset,
      limit: query.limit,
    });

    return c.json(
      pageOf(
        result.items.map((row) => mapSong(row, baseUrl)),
        result.total,
        query.offset,
        query.limit,
      ),
      200,
    );
  });

  app.openapi(favoriteIdsRoute, async (c) => {
    const user = await requireUser(c);
    return c.json(await c.get("catalog").listFavoriteSongIds(user.id), 200);
  });

  app.openapi(listFavoriteAlbumsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const result = await c.get("catalog").listFavoriteAlbums({
      userId: user.id,
      offset: query.offset,
      limit: query.limit,
    });

    return c.json(
      pageOf(
        result.items.map((row) => mapAlbum(row, baseUrl)),
        result.total,
        query.offset,
        query.limit,
      ),
      200,
    );
  });

  app.openapi(favoriteAlbumIdsRoute, async (c) => {
    const user = await requireUser(c);
    return c.json(await c.get("catalog").listFavoriteAlbumIds(user.id), 200);
  });

  app.openapi(listFavoritePlaylistsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const result = await c.get("catalog").listFavoritePlaylists({
      userId: user.id,
      offset: query.offset,
      limit: query.limit,
    });

    return c.json(
      pageOf(
        result.items.map((row) => mapPlaylist(row, baseUrl)),
        result.total,
        query.offset,
        query.limit,
      ),
      200,
    );
  });

  app.openapi(favoritePlaylistIdsRoute, async (c) => {
    const user = await requireUser(c);
    return c.json(
      await c.get("catalog").listFavoritePlaylistIds(user.id),
      200,
    );
  });

  app.openapi(libraryIdsRoute, async (c) => {
    const user = await requireUser(c);
    return c.json(await c.get("catalog").getLibraryIds(user.id), 200);
  });

  app.openapi(listMyPlaylistsRoute, async (c) => {
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const rows = await c.get("catalog").listMyPlaylists(user.id);

    return c.json(
      rows.map((row) => mapMyPlaylist(row, baseUrl)),
      200,
    );
  });

  app.openapi(listMyPlaylistsPageRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const result = await c.get("catalog").listMyPlaylistsPage({
      userId: user.id,
      offset: query.offset,
      limit: query.limit,
    });

    return c.json(
      pageOf(
        result.items.map((row) => mapMyPlaylist(row, baseUrl)),
        result.total,
        query.offset,
        query.limit,
      ),
      200,
    );
  });

  app.openapi(recentlyPlayedRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const result = await c.get("catalog").listRecentlyPlayed({
      userId: user.id,
      offset: query.offset,
      limit: query.limit,
    });

    return c.json(
      pageOf(
        result.items.map((row) => mapRecentlyPlayed(row, baseUrl)),
        result.total,
        query.offset,
        query.limit,
      ),
      200,
    );
  });

  return app;
}
