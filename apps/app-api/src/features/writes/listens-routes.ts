import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { ErrorSchema } from "../../lib/errors";
import type { AppBindings } from "../../types";
import { requireSong } from "../catalog/service";
import { ListenCreateSchema, ListenReadSchema } from "./schema";
import { toListenRead } from "./service";

/**
 * Registro de reproducciones (`POST /me/listens`).
 *
 * El dedupe de 30 s y los incrementos atómicos viven en una única sentencia
 * con CTEs (`PgWritesRepository.recordListen`): un doble-fire de play/pause
 * devuelve 201 sin insertar fila ni tocar contadores.
 */

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
});

const recordListenRoute = createRoute({
  method: "post",
  path: "/me/listens",
  tags: ["listens"],
  summary: "Registra una reproducción",
  description:
    "Idempotente ~30 s por canción: mismo song dentro de la ventana → 201 con el último listen, sin duplicar contadores.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ListenCreateSchema } },
    },
  },
  security: [{ sessionCookie: [] }],
  responses: {
    201: {
      description: "Listen registrado (o deduplicado)",
      content: { "application/json": { schema: ListenReadSchema } },
    },
    400: errorResponse("Body inválido"),
    401: errorResponse("Sin sesión válida"),
    404: errorResponse("Canción inexistente"),
  },
});

export function createListensWriteRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(recordListenRoute, async (c) => {
    const { song_id: songId } = c.req.valid("json");
    const user = await requireUser(c);

    requireSong(await c.get("catalog").getSongById(songId), songId);
    const listen = await c.get("writes").recordListen(user.id, songId);

    return c.json(toListenRead(listen), 201);
  });

  return app;
}
