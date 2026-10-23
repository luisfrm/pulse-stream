/**
 * Endpoints del historial de reproducciones (espejo de
 * `features/listens/router.py`).
 *
 *   POST /me/listens            -> 201 ListenRead (dedupe de 30 s)
 *   GET  /me/recently-played    -> Page<RecentlyPlayedSong>
 *
 * Ambos exigen sesión: el `user_id` sale SIEMPRE de la cookie, nunca del body.
 * Completar canciones (álbum/artista/colaboradores) lo hace el loader
 * batcheado del repositorio de canciones.
 */

import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toListenDto, toSongDto } from "@/lib/serialize";
import { requireUser } from "@/middleware/auth";
import {
  HTTPValidationErrorSchema,
  ListenCreateSchema,
  ListenReadSchema,
  PageRecentlyPlayedSongSchema,
} from "@/schemas";
import { listRecentlyPlayed, recordPlay } from "@/services/listens";

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
}
