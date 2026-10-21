import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import { ErrorSchema } from "../../lib/errors";
import type { AppBindings } from "../../types";
import type { UpdateUserProfileFields } from "../writes/repository";
import { updateProfile } from "../writes/service";
import { UserReadSchema, UserUpdateSchema } from "./schema";
import { toUserRead } from "./service";

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorSchema } },
});

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
    401: errorResponse("Sin sesión válida"),
  },
});

const updateMeRoute = createRoute({
  method: "patch",
  path: "/users/me",
  tags: ["users"],
  summary: "Actualiza el perfil propio",
  description:
    "Solo `username` y `cover_key`. `role`, `email`, `password`, `is_superuser` e `is_active` se ignoran (el rol solo lo cambia el panel).",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UserUpdateSchema } },
    },
  },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "Perfil actualizado",
      content: { "application/json": { schema: UserReadSchema } },
    },
    400: errorResponse("Body inválido o username ya en uso"),
    401: errorResponse("Sin sesión válida"),
  },
});

export function createUsersRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(getMeRoute, async (c) => {
    const user = await requireUser(c);
    return c.json(toUserRead(user, c.get("config")), 200);
  });

  app.openapi(updateMeRoute, async (c) => {
    const payload = c.req.valid("json");
    const user = await requireUser(c);
    const config = c.get("config");

    // Los campos de auth (`role`, `email`, `password`, `is_active`,
    // `is_superuser`) no están en el schema: Zod los descarta y nunca llegan
    // al UPDATE.
    const fields: UpdateUserProfileFields = {};
    if (payload.username !== undefined) fields.username = payload.username;
    if (payload.cover_key !== undefined) fields.coverKey = payload.cover_key;

    // PATCH vacío: mismo contrato que Python (200 con el usuario actual, sin
    // bump de `updated_at`).
    if (Object.keys(fields).length === 0) {
      return c.json(toUserRead(user, config), 200);
    }

    const updated = await updateProfile(c.get("writes"), user, fields);
    return c.json(toUserRead(updated, config), 200);
  });

  return app;
}
