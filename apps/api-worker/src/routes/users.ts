/**
 * Endpoints de `/users/*` (espejo de `fastapi_users.get_users_router`).
 *
 *   GET/PATCH /users/me     -> cualquier usuario activo
 *   GET/PATCH/DELETE /users/{id} -> solo superusuario (403 "Forbidden")
 *
 * `{id}` es `str` en el contrato de FastAPI: se normaliza como `uuid.UUID()`
 * (forma con guiones, 32 hex, `{...}` o `urn:uuid:...`) y un id inválido o
 * inexistente es 404 "Not Found" (`user_manager.parse_id` -> `InvalidID`).
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { toUserDto } from "@/lib/serialize";
import { requireSuperuser, requireUser } from "@/middleware/auth";
import {
  ErrorModelSchema,
  HTTPValidationErrorSchema,
  UserReadSchema,
  UserUpdateSchema,
} from "@/schemas";
import {
  deleteUserAsSuperuser,
  getUserOr404,
  updateProfile,
} from "@/services/users";
import type { AppEnv } from "@/index";

/** 400 de fastapi-users: body `ErrorModel` (`{"detail": ...}`). */
const badRequest = {
  description: "Bad Request",
  content: { "application/json": { schema: ErrorModelSchema } },
};

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const unauthorized = { description: "Missing token or inactive user." };
const forbidden = { description: "Not a superuser." };
const userNotFound = { description: "The user does not exist." };

const userIdParams = z.object({ id: z.string() });

const meRoute = createRoute({
  method: "get",
  path: "/users/me",
  tags: ["users"],
  summary: "Users:Current User",
  operationId: "users_current_user_users_me_get",
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    401: unauthorized,
  },
});

const patchMeRoute = createRoute({
  method: "patch",
  path: "/users/me",
  tags: ["users"],
  summary: "Users:Patch Current User",
  operationId: "users_patch_current_user_users_me_patch",
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UserUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    400: badRequest,
    401: unauthorized,
    422: validationError,
  },
});

const getUserRoute = createRoute({
  method: "get",
  path: "/users/{id}",
  tags: ["users"],
  summary: "Users:User",
  operationId: "users_user_users__id__get",
  middleware: [requireSuperuser] as const,
  request: { params: userIdParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    401: unauthorized,
    403: forbidden,
    404: userNotFound,
    422: validationError,
  },
});

const patchUserRoute = createRoute({
  method: "patch",
  path: "/users/{id}",
  tags: ["users"],
  summary: "Users:Patch User",
  operationId: "users_patch_user_users__id__patch",
  middleware: [requireSuperuser] as const,
  request: {
    params: userIdParams,
    body: {
      required: true,
      content: { "application/json": { schema: UserUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    400: badRequest,
    401: unauthorized,
    403: forbidden,
    404: userNotFound,
    422: validationError,
  },
});

const deleteUserRoute = createRoute({
  method: "delete",
  path: "/users/{id}",
  tags: ["users"],
  summary: "Users:Delete User",
  operationId: "users_delete_user_users__id__delete",
  middleware: [requireSuperuser] as const,
  request: { params: userIdParams },
  responses: {
    204: { description: "Successful Response" },
    401: unauthorized,
    403: forbidden,
    404: userNotFound,
    422: validationError,
  },
});

export function registerUserRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(meRoute, (c) => {
    const config = c.get("config");
    return c.json(toUserDto(c.get("user"), config), 200);
  });

  app.openapi(patchMeRoute, async (c) => {
    const config = c.get("config");
    const updated = await updateProfile(
      config,
      c.get("user"),
      c.req.valid("json"),
    );
    return c.json(toUserDto(updated, config), 200);
  });

  app.openapi(getUserRoute, async (c) => {
    const config = c.get("config");
    const row = await getUserOr404(config, c.req.valid("param").id);
    return c.json(toUserDto(row, config), 200);
  });

  app.openapi(patchUserRoute, async (c) => {
    const config = c.get("config");
    const target = await getUserOr404(config, c.req.valid("param").id);
    const updated = await updateProfile(config, target, c.req.valid("json"));
    return c.json(toUserDto(updated, config), 200);
  });

  app.openapi(deleteUserRoute, async (c) => {
    const config = c.get("config");
    await deleteUserAsSuperuser(config, c.req.valid("param").id);
    return c.body(null, 204);
  });
}
