import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { NotFoundError, ErrorSchema } from "../../lib/errors";
import { publicCache } from "../../lib/cache";
import type { AppBindings } from "../../types";
import {
  mapAlbum,
  mapArtist,
  mapPlaylist,
  mapPlaylistDetail,
  mapSong,
} from "./mappers";
import type { CatalogRepository } from "./repository";
import {
  AlbumDetailSchema,
  AlbumParamsSchema,
  AlbumPageSchema,
  ArtistPageSchema,
  ArtistParamsSchema,
  ArtistReadSchema,
  ListAlbumsQuerySchema,
  ListArtistsQuerySchema,
  ListPlaylistsQuerySchema,
  ListSongsQuerySchema,
  PageQuerySchema,
  PlaylistDetailSchema,
  PlaylistPageSchema,
  PlaylistParamsSchema,
  PlaylistReadSchema,
  PopularSongsQuerySchema,
  SONG_GENRES,
  SongGenreSchema,
  SongPageSchema,
  SongParamsSchema,
  SongReadSchema,
  SongWithPlaysSchema,
} from "./schema";
import {
  flagToBool,
  pageOf,
  requireArtist,
  requirePlaylistAccess,
  requireSong,
  resolveSince,
} from "./service";

/**
 * Lecturas públicas del catálogo (paridad con la API Python).
 *
 * Los GETs públicos pasan por `publicCache` (60 s). `/playlists` y
 * `/playlists/{id}` exigen sesión y NO se cachean.
 */

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorSchema } },
  };
}

const listSongsRoute = createRoute({
  method: "get",
  path: "/songs",
  tags: ["songs"],
  summary: "Listado de canciones",
  description:
    "Catálogo paginado. Filtros: `q` (título, ILIKE), `artist_id`, `collaborator_id` (excluye al artista principal), `album_id` y `playlist_id` (orden por posición).",
  request: { query: ListSongsQuerySchema },
  responses: {
    200: {
      description: "Página de canciones",
      content: { "application/json": { schema: SongPageSchema } },
    },
    400: errorResponse("Query inválida"),
  },
});

const popularSongsRoute = createRoute({
  method: "get",
  path: "/songs/popular",
  tags: ["songs"],
  summary: "Canciones más escuchadas",
  description:
    "Top por reproducciones en una ventana (`days`, o el mes calendario UTC con `month=true`). `play_count` es el count de la ventana.",
  request: { query: PopularSongsQuerySchema },
  responses: {
    200: {
      description: "Ranking de canciones",
      content: {
        "application/json": { schema: z.array(SongWithPlaysSchema) },
      },
    },
    400: errorResponse("Query inválida"),
  },
});

const getSongRoute = createRoute({
  method: "get",
  path: "/songs/{song_id}",
  tags: ["songs"],
  summary: "Detalle de una canción",
  request: { params: SongParamsSchema },
  responses: {
    200: {
      description: "Canción",
      content: { "application/json": { schema: SongReadSchema } },
    },
    400: errorResponse("ID inválido"),
    404: errorResponse("Canción inexistente"),
  },
});

const listAlbumsRoute = createRoute({
  method: "get",
  path: "/albums",
  tags: ["albums"],
  summary: "Listado de álbumes",
  request: { query: ListAlbumsQuerySchema },
  responses: {
    200: {
      description: "Página de álbumes (con `song_count`)",
      content: { "application/json": { schema: AlbumPageSchema } },
    },
    400: errorResponse("Query inválida"),
  },
});

const getAlbumRoute = createRoute({
  method: "get",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Detalle de un álbum",
  description:
    "Álbum + canciones. Cada `song.album.song_count` es el total real del álbum (a diferencia de los listados, donde es 0).",
  request: { params: AlbumParamsSchema },
  responses: {
    200: {
      description: "Álbum con sus canciones",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    400: errorResponse("ID inválido"),
    404: errorResponse("Álbum inexistente"),
  },
});

const listArtistsRoute = createRoute({
  method: "get",
  path: "/artists",
  tags: ["artists"],
  summary: "Listado de artistas",
  request: { query: ListArtistsQuerySchema },
  responses: {
    200: {
      description: "Página de artistas (orden por nombre)",
      content: { "application/json": { schema: ArtistPageSchema } },
    },
    400: errorResponse("Query inválida"),
  },
});

const getArtistRoute = createRoute({
  method: "get",
  path: "/artists/{artist_id}",
  tags: ["artists"],
  summary: "Detalle de un artista",
  request: { params: ArtistParamsSchema },
  responses: {
    200: {
      description: "Artista",
      content: { "application/json": { schema: ArtistReadSchema } },
    },
    400: errorResponse("ID inválido"),
    404: errorResponse("Artista inexistente"),
  },
});

const listGenresRoute = createRoute({
  method: "get",
  path: "/genres",
  tags: ["genres"],
  summary: "Géneros permitidos",
  responses: {
    200: {
      description: "Géneros (mismo set que valida el backend)",
      content: { "application/json": { schema: z.array(SongGenreSchema) } },
    },
  },
});

const listPublicPlaylistsRoute = createRoute({
  method: "get",
  path: "/playlists/public",
  tags: ["playlists"],
  summary: "Feed público de playlists",
  description:
    "Playlists públicas de toda la comunidad: las del sistema primero y luego las nuevas.",
  request: { query: PageQuerySchema },
  responses: {
    200: {
      description: "Página de playlists públicas",
      content: { "application/json": { schema: PlaylistPageSchema } },
    },
    400: errorResponse("Query inválida"),
  },
});

const listPlaylistsRoute = createRoute({
  method: "get",
  path: "/playlists",
  tags: ["playlists"],
  summary: "Playlists del usuario autenticado",
  description:
    "`mine=true` (default): todas las del usuario. `mine=false`: solo las públicas del mismo perfil.",
  request: { query: ListPlaylistsQuerySchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Playlists del usuario",
      content: { "application/json": { schema: z.array(PlaylistReadSchema) } },
    },
    400: errorResponse("Query inválida"),
    401: errorResponse("Sin sesión válida"),
  },
});

const getPlaylistRoute = createRoute({
  method: "get",
  path: "/playlists/{playlist_id}",
  tags: ["playlists"],
  summary: "Detalle de una playlist",
  description:
    "Playlist + canciones ordenadas por posición. 403 si es privada y el usuario no es el dueño.",
  request: { params: PlaylistParamsSchema },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Playlist con sus canciones",
      content: { "application/json": { schema: PlaylistDetailSchema } },
    },
    400: errorResponse("ID inválido"),
    401: errorResponse("Sin sesión válida"),
    403: errorResponse("Playlist privada de otro usuario"),
    404: errorResponse("Playlist inexistente"),
  },
});

export function createCatalogRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  // GETs públicos → caché 60 s (no-op sin `caches`, ej. tests en Node).
  for (const path of [
    "/songs",
    "/songs/popular",
    "/songs/:song_id",
    "/albums",
    "/albums/:album_id",
    "/artists",
    "/artists/:artist_id",
    "/genres",
    "/playlists/public",
  ]) {
    app.use(path, publicCache());
  }

  app.openapi(listSongsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const result = await c.get("catalog").listSongs({
      offset: query.offset,
      limit: query.limit,
      search: query.q,
      artistId: query.artist_id,
      collaboratorId: query.collaborator_id,
      albumId: query.album_id,
      playlistId: query.playlist_id,
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

  app.openapi(popularSongsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const since = resolveSince(query.days, flagToBool(query.month, false));
    const rows = await c.get("catalog").listPopularSongs({
      since: since.toISOString(),
      limit: query.limit,
    });

    return c.json(
      rows.map((row) =>
        mapSong(row, baseUrl, { play_count: row.window_play_count }),
      ),
      200,
    );
  });

  app.openapi(getSongRoute, async (c) => {
    const { song_id: songId } = c.req.valid("param");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const row = requireSong(await c.get("catalog").getSongById(songId), songId);

    return c.json(mapSong(row, baseUrl), 200);
  });

  app.openapi(listAlbumsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const result = await c.get("catalog").listAlbums({
      offset: query.offset,
      limit: query.limit,
      search: query.q,
      artistId: query.artist_id,
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

  app.openapi(getAlbumRoute, async (c) => {
    const { album_id: albumId } = c.req.valid("param");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const detail = await c.get("catalog").getAlbumWithSongs(albumId);

    if (!detail) throw new NotFoundError(`Álbum ${albumId} no existe`);

    const album = mapAlbum(detail.album, baseUrl);
    return c.json(
      {
        ...album,
        songs: detail.songs.map((row) =>
          mapSong(row, baseUrl, { album }),
        ),
      },
      200,
    );
  });

  app.openapi(listArtistsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const result = await c.get("catalog").listArtists({
      offset: query.offset,
      limit: query.limit,
      search: query.q,
    });

    return c.json(
      pageOf(
        result.items.map((row) => mapArtist(row, baseUrl)),
        result.total,
        query.offset,
        query.limit,
      ),
      200,
    );
  });

  app.openapi(getArtistRoute, async (c) => {
    const { artist_id: artistId } = c.req.valid("param");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const row = requireArtist(
      await c.get("catalog").getArtistById(artistId),
      artistId,
    );

    return c.json(mapArtist(row, baseUrl), 200);
  });

  app.openapi(listGenresRoute, (c) => c.json([...SONG_GENRES], 200));

  app.openapi(listPublicPlaylistsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const result = await c.get("catalog").listPublicPlaylists({
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

  app.openapi(listPlaylistsRoute, async (c) => {
    const query = c.req.valid("query");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const catalog: CatalogRepository = c.get("catalog");
    const mine = flagToBool(query.mine, true);

    const rows = mine
      ? await catalog.listPlaylistsByOwner(user.id)
      : await catalog.listPublicPlaylistsByOwner(user.id);

    return c.json(
      rows.map((row) => mapPlaylist(row, baseUrl)),
      200,
    );
  });

  app.openapi(getPlaylistRoute, async (c) => {
    const { playlist_id: playlistId } = c.req.valid("param");
    const baseUrl = c.get("config").r2PublicBaseUrl;
    const user = await requireUser(c);
    const detail = await c.get("catalog").getPlaylistWithSongs(playlistId);

    if (!detail) throw new NotFoundError(`Playlist ${playlistId} no existe`);

    const playlist = requirePlaylistAccess(detail.playlist, playlistId, user);

    return c.json(mapPlaylistDetail(playlist, detail.songs, baseUrl), 200);
  });

  return app;
}
