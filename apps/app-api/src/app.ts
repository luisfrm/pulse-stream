import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { SESSION_COOKIE } from "./auth/cookies";
import type { GoogleClient } from "./auth/google";
import { createAuthRoutes } from "./auth/routes";
import type { AppConfig } from "./config";
import type { Env } from "./env";
import type { UserRepository } from "./features/users/repository";
import { createUsersRoutes } from "./features/users/routes";
import { AppError, ErrorSchema } from "./lib/errors";
import type { AppBindings, AppContext } from "./types";

export type UserRepositoryFactory = (env: Env) => UserRepository;

/**
 * Dependencias inyectables para testear sin DB ni red.
 * `users` puede ser:
 * - una instancia (tests: repo fake en memoria);
 * - una factory `(env) => repository` (producción: `pg.Client` por request).
 */
export interface AppDependencies {
  config: AppConfig;
  users: UserRepository | UserRepositoryFactory;
  google: GoogleClient;
}

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["system"],
  summary: "Healthcheck",
  responses: {
    200: {
      description: "El Worker está vivo",
      content: {
        "application/json": {
          schema: z.object({ status: z.literal("ok") }).openapi("Health"),
        },
      },
    },
  },
});

function resolveUsers(
  source: UserRepository | UserRepositoryFactory,
  env: Env,
): UserRepository {
  return typeof source === "function" ? source(env) : source;
}

function closeUsers(c: AppContext, users: UserRepository): void {
  if (typeof users.close !== "function") return;

  let closing: Promise<void>;
  try {
    closing = users.close().catch(() => undefined);
  } catch {
    return;
  }

  try {
    // En Workers: no bloquear la respuesta esperando el cierre del socket.
    c.executionCtx.waitUntil(closing);
  } catch {
    // `app.request()` de los tests no tiene ExecutionContext.
    void closing.catch(() => undefined);
  }
}

function handleError(error: unknown, c: AppContext): Response {
  if (error instanceof AppError) {
    return c.json(
      { detail: error.message },
      error.status as ContentfulStatusCode,
    );
  }

  console.error("app-api: unhandled error", error);
  return c.json({ detail: "Internal Server Error" }, 500);
}

export function createApp(deps: AppDependencies): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ detail: "Invalid request" }, 400);
      }
    },
  });

  const allowedOrigins = new Set(deps.config.corsOrigins);

  app.use(
    "*",
    cors({
      origin: (origin) =>
        allowedOrigins.has(origin) ? origin : undefined,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );

  // Catch middleware ANTES de los handlers: la respuesta de error pasa por el
  // post-procesamiento de CORS (los headers se setean antes de `next()`).
  app.use("*", async (c, next) => {
    try {
      await next();
    } catch (error) {
      return handleError(error, c);
    }
  });

  app.use("*", async (c, next) => {
    const users = resolveUsers(deps.users, c.env);

    c.set("config", deps.config);
    c.set("users", users);
    c.set("google", deps.google);

    try {
      await next();
    } finally {
      closeUsers(c, users);
    }
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: SESSION_COOKIE,
  });

  app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));
  app.route("/", createUsersRoutes());
  app.route("/", createAuthRoutes());

  app.notFound((c) => c.json({ detail: "Not Found" }, 404));
  app.onError((error, c) => handleError(error, c));

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Pulse Stream App API",
      version: "0.1.0",
      description:
        "API de la app (Hono + Workers). Fase 0: health, sesión Google y /users/me.",
    },
  });

  return app;
}
