/**
 * Endpoints de `/auth/*` (espejo de `features/auth/router.py`).
 *
 * Los bodies y los códigos de estado son los de fastapi-users:
 *   login 204 (Set-Cookie), logout 204, register 201 UserRead,
 *   forgot-password 202 null, reset-password 200 null,
 *   request-verify-token 202 null, verify 200 UserRead.
 *
 * El login es `application/x-www-form-urlencoded`: se parsea a mano porque el
 * `remember` llega como string ("true"/"false"/"on") y Pydantic lo coacciona a
 * bool — `z.boolean()` sobre un form fallaría.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";

import { buildExpiredSessionCookie, buildSessionCookie } from "@/auth/cookies";
import type { AppEnv } from "@/index";
import { toUserDto } from "@/lib/serialize";
import { toFastApiValidationError } from "@/lib/validate";
import { enforceRateLimit } from "@/middleware/auth";
import { HTTPValidationErrorSchema, UserCreateSchema, UserReadSchema } from "@/schemas";
import {
  ForgotPasswordSchema,
  LoginFormSchema,
  RequestVerifyTokenSchema,
  ResetPasswordSchema,
  VerifyTokenSchema,
  parseRemember,
} from "@/schemas/auth";
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

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  tags: ["auth"],
  summary: "Auth:Cookie.Login",
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
  responses: {
    204: { description: "Successful Response" },
  },
});

const registerRoute = createRoute({
  method: "post",
  path: "/auth/register",
  tags: ["auth"],
  summary: "Register:Register",
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
    422: validationError,
  },
});

const forgotPasswordRoute = createRoute({
  method: "post",
  path: "/auth/forgot-password",
  tags: ["auth"],
  summary: "Reset:Forgot Password",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ForgotPasswordSchema } },
    },
  },
  responses: {
    202: {
      description: "Successful Response",
      content: { "application/json": { schema: z.null() } },
    },
    422: validationError,
  },
});

const resetPasswordRoute = createRoute({
  method: "post",
  path: "/auth/reset-password",
  tags: ["auth"],
  summary: "Reset:Reset Password",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ResetPasswordSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: z.null() } },
    },
    422: validationError,
  },
});

const requestVerifyTokenRoute = createRoute({
  method: "post",
  path: "/auth/request-verify-token",
  tags: ["auth"],
  summary: "Verify:Request-Token",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RequestVerifyTokenSchema } },
    },
  },
  responses: {
    202: {
      description: "Successful Response",
      content: { "application/json": { schema: z.null() } },
    },
    422: validationError,
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/auth/verify",
  tags: ["auth"],
  summary: "Verify:Verify",
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
    422: validationError,
  },
});

export function registerAuthRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(loginRoute, async (c) => {
    const config = c.get("config");
    // ANTES de better-auth: el 429 tiene que ser el body de slowapi.
    await enforceRateLimit(c, "login", config.rateLimits.login);

    let form: Record<string, unknown>;
    try {
      form = await c.req.parseBody();
    } catch {
      form = {};
    }

    const parsed = LoginFormSchema.safeParse(form);
    if (!parsed.success) {
      return c.json(toFastApiValidationError(parsed.error, "form"), 422);
    }

    const cookieValue = await login(
      config,
      { username: parsed.data.username, password: parsed.data.password },
      c.req.raw.headers,
    );

    c.header(
      "Set-Cookie",
      buildSessionCookie(config, cookieValue, {
        persistent: parseRemember(parsed.data.remember),
      }),
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
