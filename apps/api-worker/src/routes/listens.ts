/**
 * Endpoints del historial de reproducciones (espejo de
 * `features/listens/router.py`).
 *
 *   POST /me/listens            -> 201 ListenRead (dedupe de 30 s)
 *   GET  /me/recently-played    -> Page<RecentlyPlayedSong>
 *   GET  /me/top-songs          -> SongWithPlays[] (solo Worker; Python congelado)
 *
 * Todos exigen sesión: el `user_id` sale SIEMPRE de la cookie, nunca del body.
 * Completar canciones (álbum/artista/colaboradores) lo hace el loader
 * batcheado del repositorio de canciones.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toListenDto, toSongDto, toSongWithPlaysDto } from "@/lib/serialize";
import { requireUser } from "@/middleware/auth";
import {
  HTTPValidationErrorSchema,
  ListenCreateSchema,
  ListenReadSchema,
  PageRecentlyPlayedSongSchema,
  SongWithPlaysSchema,
  queryInt,
} from "@/schemas";
import {
  listRecentlyPlayed,
  listTopSongsForUser,
  recordPlay,
} from "@/services/listens";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const recordPlayRoute = createRoute({
  method: "post",
  path: "/me/listens",
  tags: ["listens"],
  summary: "Record Play",
  operationId: "record_play_me_listens_post",
  description:
    "Registra una reproducción (play). Idempotente dentro de ~30 s por canción.\n\n" +
    "Cada play suma +1 a `songs.play_count` y a `users.total_plays`.",
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ListenCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: ListenReadSchema } },
    },
    422: validationError,
  },
});

const recentlyPlayedRoute = createRoute({
  method: "get",
  path: "/me/recently-played",
  tags: ["listens"],
  summary: "Recently Played",
  operationId: "recently_played_me_recently_played_get",
  description:
    "Canciones reproducidas por el usuario (sin duplicar), último play primero.\n\n" +
    "Cada item incluye `user_play_count`: cuántas veces la tocó el usuario.",
  middleware: [requireUser] as const,
  request: { query: pageQuerySchema() },
  responses: {
    200: {
      description: "Successful Response",
      content: {
        "application/json": { schema: PageRecentlyPlayedSongSchema },
      },
    },
    422: validationError,
  },
});

const topSongsQuery = z.object({
  days: queryInt({
    min: 1,
    max: 365,
    default: 7,
    description: "Ventana móvil en días",
  }),
  limit: queryInt({ min: 1, max: 50, default: 10 }),
});

const topSongsRoute = createRoute({
  method: "get",
  path: "/me/top-songs",
  tags: ["listens"],
  summary: "Top Songs (usuario)",
  operationId: "top_songs_me_top_songs_get",
  description:
    "Ranking de las canciones MÁS ESCUCHADAS POR EL USUARIO en los últimos " +
    "`days` días (por defecto 7). `play_count` de cada item son los plays del " +
    "usuario en la ventana, no el global.",
  middleware: [requireUser] as const,
  request: { query: topSongsQuery },
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

export function registerListenRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(recordPlayRoute, async (c) => {
    const config = c.get("config");
    const { song_id } = c.req.valid("json");
    const listen = await recordPlay(config, c.get("user"), song_id);
    return c.json(toListenDto(listen), 201);
  });

  app.openapi(recentlyPlayedRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const page = await listRecentlyPlayed(config, c.get("user"), offset, limit);

    return c.json(
      paginate(
        page.items.map(({ song, userPlayCount }) => ({
          ...toSongDto(song, config),
          user_play_count: userPlayCount,
        })),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  app.openapi(topSongsRoute, async (c) => {
    const config = c.get("config");
    const { days, limit } = c.req.valid("query");
    const ranking = await listTopSongsForUser(config, c.get("user"), {
      days,
      limit,
    });

    return c.json(
      ranking.map(({ song, plays }) => toSongWithPlaysDto(song, config, plays)),
      200,
    );
  });
}
