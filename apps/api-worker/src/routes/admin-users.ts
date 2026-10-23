/**
 * Endpoints de `/admin/users` (espejo de `features/users/router.py`).
 *
 * Solo `role=admin` o `is_superuser` (`require_admin`). El listado devuelve un
 * array pelado (no `Page<T>`) ordenado por `created_at desc`, igual que Python.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "@/index";
import { pageQuerySchema } from "@/lib/pagination";
import { toUserDto } from "@/lib/serialize";
import { requireAdmin } from "@/middleware/auth";
import {
  HTTPValidationErrorSchema,
  UserReadSchema,
  UserRoleUpdateSchema,
} from "@/schemas";
import { deleteUserAsAdmin, listAllUsers, setRoleAsAdmin } from "@/services/users";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const userIdParams = z.object({ user_id: z.uuid() });

const listUsersRoute = createRoute({
  method: "get",
  path: "/admin/users",
  tags: ["users"],
  summary: "List Users",
  description: "Listado de usuarios - solo admin (role=admin).",
  middleware: [requireAdmin] as const,
  request: { query: pageQuerySchema() },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: z.array(UserReadSchema) } },
    },
    422: validationError,
  },
});

const deleteUserRoute = createRoute({
  method: "delete",
  path: "/admin/users/{user_id}",
  tags: ["users"],
  summary: "Delete User",
  description:
    "Borra un usuario - solo admin, y no puede borrarse a si mismo.",
  middleware: [requireAdmin] as const,
  request: { params: userIdParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

const setRoleRoute = createRoute({
  method: "patch",
  path: "/admin/users/{user_id}/role",
  tags: ["users"],
  summary: "Set User Role",
  description:
    'Asigna/revoca el rol de un usuario - solo admin.\n\n`role: "admin"` ' +
    "otorga acceso al panel; `role: null` lo revoca.\nUn admin no puede " +
    "quitarse su propio rol.",
  middleware: [requireAdmin] as const,
  request: {
    params: userIdParams,
    body: {
      required: true,
      content: { "application/json": { schema: UserRoleUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    422: validationError,
  },
});

export function registerAdminUserRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(listUsersRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit } = c.req.valid("query");
    const rows = await listAllUsers(config, offset, limit);
    return c.json(
      rows.map((row) => toUserDto(row, config)),
      200,
    );
  });

  app.openapi(deleteUserRoute, async (c) => {
    const config = c.get("config");
    await deleteUserAsAdmin(
      config,
      c.get("user"),
      c.req.valid("param").user_id,
    );
    return c.body(null, 204);
  });

  app.openapi(setRoleRoute, async (c) => {
    const config = c.get("config");
    const updated = await setRoleAsAdmin(
      config,
      c.get("user"),
      c.req.valid("param").user_id,
      c.req.valid("json").role,
    );
    return c.json(toUserDto(updated, config), 200);
  });
}
