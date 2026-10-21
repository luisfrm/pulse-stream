import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { SESSION_COOKIE } from "./auth/cookies";
import { createAuthRoutes } from "./auth/routes";
import type { AppConfig } from "./config";
import type { RequestRepositories } from "./db/client";
import type { Env } from "./env";
import { createCatalogRoutes } from "./features/catalog/routes";
import { createCatalogMeRoutes } from "./features/catalog/me-routes";
import type { CatalogRepository } from "./features/catalog/repository";
import { createCoverPresigner, type CoverPresigner } from "./features/uploads/presign";
import { createUploadsRoutes } from "./features/uploads/routes";
import type { UserRepository } from "./features/users/repository";
import { createUsersRoutes } from "./features/users/routes";
import { createFavoritesWriteRoutes } from "./features/writes/favorites-routes";
import { createListensWriteRoutes } from "./features/writes/listens-routes";
import { createPlaylistsWriteRoutes } from "./features/writes/playlists-routes";
import type { WritesRepository } from "./features/writes/repository";
import { AppError, ErrorSchema } from "./lib/errors";
import type { AppBindings, AppContext } from "./types";

export type UserRepositoryFactory = (env: Env) => UserRepository;
export type CatalogRepositoryFactory = (env: Env) => CatalogRepository;
export type WritesRepositoryFactory = (env: Env) => WritesRepository;

/**
 * Dependencias inyectables para testear sin DB ni red.
 *
 * - `users`/`catalog`/`writes`: una instancia (tests: repo fake en memoria) o
 *   una factory `(env) => repository`.
 * - `repositories` (producción): crea los 3 repos compartiendo el driver HTTP
 *   de Neon por request (`db/client.ts`).
 * - `coverPresigner`: firmer de covers inyectable. `undefined` = derivarlo de
 *   `config.r2`; `null` = R2 no configurado (503).
 */
export interface AppDependencies {
  config: AppConfig;
  users?: UserRepository | UserRepositoryFactory;
  catalog?: CatalogRepository | CatalogRepositoryFactory;
  writes?: WritesRepository | WritesRepositoryFactory;
  repositories?: (env: Env) => RequestRepositories;
  coverPresigner?: CoverPresigner | null;
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

interface ResolvedRepositories {
  users: UserRepository;
  catalog: CatalogRepository;
  writes: WritesRepository;
  close(): Promise<void>;
}

function resolveRepositories(
  deps: AppDependencies,
  env: Env,
): ResolvedRepositories {
  if (deps.repositories) {
    const repositories = deps.repositories(env);
    return {
      users: repositories.users,
      catalog: repositories.catalog,
      writes: repositories.writes,
      close: () => repositories.close(),
    };
  }

  const users =
    typeof deps.users === "function" ? deps.users(env) : deps.users;
  const catalog =
    typeof deps.catalog === "function" ? deps.catalog(env) : deps.catalog;
  const writes =
    typeof deps.writes === "function" ? deps.writes(env) : deps.writes;

  if (!users) throw new Error("app-api: users repository is not configured");
  if (!catalog) throw new Error("app-api: catalog repository is not configured");
  if (!writes) throw new Error("app-api: writes repository is not configured");

  return {
    users,
    catalog,
    writes,
    close: async () => {
      await users.close?.();
      await catalog.close?.();
      await writes.close?.();
    },
  };
}

function closeRepositories(c: AppContext, repositories: ResolvedRepositories): void {
  let closing: Promise<void>;
  try {
    closing = repositories.close().catch(() => undefined);
  } catch {
    return;
  }

  try {
    // En Workers: no bloquear la respuesta; en HTTP el cierre es no-op.
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

  // Firma de covers: override de tests o derivada de R2_* (`null` = 503).
  const coverPresigner =
    deps.coverPresigner !== undefined
      ? deps.coverPresigner
      : createCoverPresigner(deps.config.r2);

  const allowedOrigins = new Set(deps.config.corsOrigins);

  app.use(
    "*",
    cors({
      origin: (origin) =>
        allowedOrigins.has(origin) ? origin : undefined,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
    const repositories = resolveRepositories(deps, c.env);

    c.set("config", deps.config);
    c.set("users", repositories.users);
    c.set("catalog", repositories.catalog);
    c.set("writes", repositories.writes);
    c.set("coverPresigner", coverPresigner);

    try {
      await next();
    } finally {
      closeRepositories(c, repositories);
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
  app.route("/", createCatalogRoutes());
  app.route("/", createCatalogMeRoutes());
  app.route("/", createFavoritesWriteRoutes());
  app.route("/", createPlaylistsWriteRoutes());
  app.route("/", createListensWriteRoutes());
  app.route("/", createUploadsRoutes());

  app.notFound((c) => c.json({ detail: "Not Found" }, 404));
  app.onError((error, c) => handleError(error, c));

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Pulse Stream App API",
      version: "0.3.0",
      description:
        "API de la app (Hono + Workers). Fase 2: lecturas con paridad con la API Python. Fase 3: favoritos, playlists de usuario, listens/contadores, perfil y presign de covers.",
    },
  });

  return app;
}
