/**
 * Endpoints de `/auth/*` (espejo de `features/auth/router.py`).
 *
 * Los bodies y los códigos de estado son los de fastapi-users:
 *   login 204 (Set-Cookie), logout 204, register 201 UserRead,
 *   forgot-password 202 null, reset-password 200 null,
 *   request-verify-token 202 null, verify 200 UserRead.
 *
 * Los bodies usan los componentes `Body_*` que emite FastAPI (ver
 * `schemas/auth.ts`): así el OpenAPI del Worker es idéntico al de Python y
 * `pnpm gen:types:worker` no cambia `generated.ts`.
 *
 * El login es `application/x-www-form-urlencoded`: el schema coacciona
 * `remember` a bool (el form lo manda como "true"/"on"/...), igual que Pydantic.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { buildExpiredSessionCookie, buildSessionCookie } from "@/auth/cookies";
import type { AppEnv } from "@/index";
import { toUserDto } from "@/lib/serialize";
import { enforceRateLimit } from "@/middleware/auth";
import {
  ErrorModelSchema,
  ForgotPasswordSchema,
  HTTPValidationErrorSchema,
  LoginBodySchema,
  RequestVerifyTokenSchema,
  ResetPasswordSchema,
  UserCreateSchema,
  UserReadSchema,
  VerifyTokenSchema,
} from "@/schemas";
import {
  login,
  logout,
  register,
  requestPasswordReset,
  requestVerifyToken,
  resetPassword,
  verifyEmail,
} from "@/services/auth";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

/** 400 de fastapi-users: body `ErrorModel` (`{"detail": ...}`). */
const badRequest = {
  description: "Bad Request",
  content: { "application/json": { schema: ErrorModelSchema } },
};

/**
 * Respuestas sin body de datos (202/200 de forgot/reset-password): FastAPI las
 * documenta con `schema: {}` (openapi-typescript -> `unknown`), no con `null`.
 */
const emptyResponse = {
  description: "Successful Response",
  content: { "application/json": { schema: z.any() } },
} as const;

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  tags: ["auth"],
  summary: "Auth:Cookie.Login",
  operationId: "auth_cookie_login_auth_login_post",
  request: {
    body: {
      required: true,
      content: {
        "application/x-www-form-urlencoded": { schema: LoginBodySchema },
      },
    },
  },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/auth/logout",
  tags: ["auth"],
  summary: "Auth:Cookie.Logout",
  operationId: "auth_cookie_logout_auth_logout_post",
  responses: {
    204: { description: "Successful Response" },
  },
});

const registerRoute = createRoute({
  method: "post",
  path: "/auth/register",
  tags: ["auth"],
  summary: "Register:Register",
  operationId: "register_register_auth_register_post",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UserCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    400: badRequest,
    422: validationError,
  },
});

const forgotPasswordRoute = createRoute({
  method: "post",
  path: "/auth/forgot-password",
  tags: ["auth"],
  summary: "Reset:Forgot Password",
  operationId: "reset_forgot_password_auth_forgot_password_post",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ForgotPasswordSchema } },
    },
  },
  responses: {
    202: emptyResponse,
    422: validationError,
  },
});

const resetPasswordRoute = createRoute({
  method: "post",
  path: "/auth/reset-password",
  tags: ["auth"],
  summary: "Reset:Reset Password",
  operationId: "reset_reset_password_auth_reset_password_post",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ResetPasswordSchema } },
    },
  },
  responses: {
    200: emptyResponse,
    400: badRequest,
    422: validationError,
  },
});

const requestVerifyTokenRoute = createRoute({
  method: "post",
  path: "/auth/request-verify-token",
  tags: ["auth"],
  summary: "Verify:Request-Token",
  operationId: "verify_request_token_auth_request_verify_token_post",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RequestVerifyTokenSchema } },
    },
  },
  responses: {
    202: emptyResponse,
    422: validationError,
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/auth/verify",
  tags: ["auth"],
  summary: "Verify:Verify",
  operationId: "verify_verify_auth_verify_post",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: VerifyTokenSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: UserReadSchema } },
    },
    400: badRequest,
    422: validationError,
  },
});

export function registerAuthRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(loginRoute, async (c) => {
    const config = c.get("config");
    // ANTES de better-auth: el 429 tiene que ser el body de slowapi.
    await enforceRateLimit(c, "login", config.rateLimits.login);

    const { username, password, remember } = c.req.valid("form");
    const cookieValue = await login(
      config,
      { username, password },
      c.req.raw.headers,
    );

    c.header(
      "Set-Cookie",
      buildSessionCookie(config, cookieValue, { persistent: remember }),
    );
    return c.body(null, 204);
  });

  app.openapi(logoutRoute, async (c) => {
    const config = c.get("config");
    await logout(config, c.req.raw.headers);

    c.header("Set-Cookie", buildExpiredSessionCookie(config));
    return c.body(null, 204);
  });

  app.openapi(registerRoute, async (c) => {
    const config = c.get("config");
    await enforceRateLimit(c, "register", config.rateLimits.register);

    const row = await register(config, c.req.valid("json"));
    return c.json(toUserDto(row, config), 201);
  });

  app.openapi(forgotPasswordRoute, async (c) => {
    const config = c.get("config");
    await requestPasswordReset(config, c.req.valid("json").email);
    return c.json(null, 202);
  });

  app.openapi(resetPasswordRoute, async (c) => {
    const config = c.get("config");
    const { token, password } = c.req.valid("json");
    await resetPassword(config, token, password);
    return c.json(null, 200);
  });

  app.openapi(requestVerifyTokenRoute, async (c) => {
    const config = c.get("config");
    await requestVerifyToken(config, c.req.valid("json").email);
    return c.json(null, 202);
  });

  app.openapi(verifyRoute, async (c) => {
    const config = c.get("config");
    const row = await verifyEmail(config, c.req.valid("json").token);
    return c.json(toUserDto(row, config), 200);
  });
}
