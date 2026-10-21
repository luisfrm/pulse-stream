import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { ErrorSchema } from "../../lib/errors";
import type { AppBindings } from "../../types";
import { UserReadSchema } from "./schema";
import { toUserRead } from "./service";

const getMeRoute = createRoute({
  method: "get",
  path: "/users/me",
  tags: ["users"],
  summary: "Usuario autenticado",
  description:
    "Devuelve el usuario dueño de la cookie `session`. Responde 401 si no hay sesión válida.",
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Usuario autenticado",
      content: { "application/json": { schema: UserReadSchema } },
    },
    401: {
      description: "Sin sesión válida",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export function createUsersRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(getMeRoute, async (c) => {
    const user = await requireUser(c);
    return c.json(toUserRead(user, c.get("config")), 200);
  });

  return app;
}
