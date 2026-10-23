/**
 * `GET /genres` (espejo de `features/genres/router.py`).
 *
 * Lista pública con los géneros permitidos, en el orden del enum.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { listGenres } from "@/services/genres";

const listGenresRoute = createRoute({
  method: "get",
  path: "/genres",
  tags: ["genres"],
  summary: "List Genres",
  operationId: "list_genres_genres_get",
  description: "Lista los géneros permitidos (mismo set que valida el backend).",
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: z.array(z.string()) } },
    },
  },
});

export function registerGenreRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listGenresRoute, (c) => c.json(listGenres(), 200));
}
