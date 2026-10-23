/**
 * App Hono del Worker — espejo de `apps/api/app/main.py`.
 *
 * F0: CORS con credenciales, error handler con el body de FastAPI,
 * `/health`, `/openapi.json` y `/docs` (solo en local), 404 JSON.
 * F3: auth + usuarios. F4: catálogo. F5: uploads (presign + import por ZIP).
 *
 * `createApp(deps)` permite inyectar el storage (R2) en los tests; `app` es la
 * instancia de producción con las dependencias reales.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { createConfig, DEFAULT_SESSION_COOKIE_NAME, type AppConfig, type Bindings } from "@/env";
import type { UserRow } from "@/db/schema";
import type { AppDeps } from "@/deps";
import { AppError, CodedAppError, isAppError } from "@/lib/errors";
import { isAllowedOrigin } from "@/lib/cors";
import { buildOpenApiDocument, registerOpenApiComponents } from "@/lib/openapi";
import { toSafeErrorLog } from "@/lib/log";
import { fastApiValidationHook, toFastApiValidationError } from "@/lib/validate";
import { requireTrustedOrigin } from "@/middleware/origin";
import { registerAdminUserRoutes } from "@/routes/admin-users";
import { registerAlbumRoutes } from "@/routes/albums";
import { registerArtistRoutes } from "@/routes/artists";
import { registerAuthRoutes } from "@/routes/auth";
import { registerGenreRoutes } from "@/routes/genres";
import { registerFavoriteRoutes } from "@/routes/favorites";
import { registerListenRoutes } from "@/routes/listens";
import { registerPlaylistRoutes } from "@/routes/playlists";
import { registerSongRoutes } from "@/routes/songs";
import { registerUploadRoutes } from "@/routes/uploads";
import { registerUserRoutes } from "@/routes/users";

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    config: AppConfig;
    /** Fila completa del usuario autenticado (`requireUser`/`requireAdmin`). */
    user: UserRow;
  };
}

/** Métodos del preflight: los mismos que expande Starlette para `["*"]`. */
const CORS_ALLOW_METHODS = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
];

/**
 * Lista blanca explícita de headers: con credenciales el navegador no acepta
 * comodines confiables. Si aparece un header nuevo en el front, sumarlo acá.
 */
const CORS_ALLOW_HEADERS = [
  "Accept",
  "Authorization",
  "Content-Type",
  "Origin",
  "X-CSRF-Token",
  "X-Requested-With",
];

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["health"],
  summary: "Health",
  operationId: "health_health_get",
  responses: {
    200: {
      description: "Successful Response",
      content: {
        "application/json": { schema: z.record(z.string(), z.string()) },
      },
    },
  },
});

/** HTML mínimo con Scalar (equivalente al Swagger UI de FastAPI en local). */
function docsHtml(openApiUrl: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pulse Stream API — docs</title>
  </head>
  <body>
    <script id="api-reference" data-url="${openApiUrl}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

export function createApp(deps: AppDeps = {}) {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: fastApiValidationHook });

  registerOpenApiComponents(app.openAPIRegistry);

  // Mismo `securitySchemes` que FastAPI (`APIKeyCookie` = cookie de sesión).
  // El nombre real se ajusta por request en `/openapi.json` (sale de
  // `config.cookie.name`); acá va el default para que el documento exista
  // aunque el registry se arme sin request.
  app.openAPIRegistry.registerComponent("securitySchemes", "APIKeyCookie", {
    type: "apiKey",
    in: "cookie",
    name: DEFAULT_SESSION_COOKIE_NAME,
  });

  // Config normalizada por request (no hay estado global mutable).
  app.use("*", async (c, next) => {
    c.set("config", createConfig(c.env));
    await next();
  });

  // CORS con allow-list por regex + credenciales (cookies). Nunca "*".
  // `isAllowedOrigin` hace fullmatch (igual que Starlette), no un test parcial.
  app.use(
    "*",
    cors({
      origin: (origin, c) =>
        isAllowedOrigin(origin, c.get("config").corsOriginRegex) ? origin : undefined,
      credentials: true,
      allowMethods: CORS_ALLOW_METHODS,
      allowHeaders: CORS_ALLOW_HEADERS,
      maxAge: 600,
    }),
  );

  // CSRF: un `Origin` fuera de la allow-list no puede mutar estado. Va
  // DESPUÉS de CORS para que el 403 salga con los headers que correspondan.
  // No aplica a GET/HEAD/OPTIONS ni a requests sin `Origin` (curl/SSR/tests).
  app.use("*", requireTrustedOrigin);

  // F3: auth + usuarios. Los routers se montan acá para que `/openapi.json`
  // los incluya en el mismo documento.
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerAdminUserRoutes(app);

  // F4: catálogo (artistas, álbumes, canciones, géneros). Mismo orden que
  // `app.include_router(...)` en `apps/api/app/main.py`.
  registerArtistRoutes(app);
  registerAlbumRoutes(app, deps);
  registerSongRoutes(app);
  registerGenreRoutes(app);

  // F5: uploads (presign de audio/covers + import por ZIP de un álbum).
  registerUploadRoutes(app, deps);

  // F6: playlists (usuario + system) y biblioteca (favoritos de canciones,
  // playlists y álbumes). Mismo orden que `include_router` en main.py.
  registerPlaylistRoutes(app);
  registerFavoriteRoutes(app);

  // F7: historial de reproducciones (`POST /me/listens` + `/me/recently-played`).
  registerListenRoutes(app);

  // `/health` va AL FINAL: FastAPI lo declara después de los routers y el orden
  // de los paths se preserva en `generated.ts` (gate de tipos).
  app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));

  // /openapi.json y /docs existen solo en local (igual que `docs_url` en la
  // API Python); fuera de local caen al 404 JSON del `notFound`.
  app.get("/openapi.json", (c) => {
    const config = c.get("config");
    if (!config.docsEnabled) {
      return c.json({ detail: "Not Found" }, 404);
    }

    // Documento compartido con `scripts/export-openapi.ts` (títulos de
    // Pydantic, orden alfabético y nombre de la cookie de sesión).
    const document = buildOpenApiDocument(app, config);
    return c.json(document);
  });

  app.get("/docs", (c) => {
    if (!c.get("config").docsEnabled) {
      return c.json({ detail: "Not Found" }, 404);
    }
    return c.html(docsHtml("/openapi.json"));
  });

  app.notFound((c) => c.json({ detail: "Not Found" }, 404));

  app.onError((error, c) => {
    // `{detail: {code, reason}}` (fastapi-users): antes del branch genérico.
    if (error instanceof CodedAppError) {
      return c.json(error.toBody(), 400);
    }

    if (isAppError(error)) {
      return c.json({ detail: error.detail }, error.status as ContentfulStatusCode);
    }

    if (error instanceof ZodError) {
      return c.json(toFastApiValidationError(error, "json"), 422);
    }

    if (error instanceof HTTPException) {
      return c.json(
        { detail: error.message || "Error interno" },
        error.status as ContentfulStatusCode,
      );
    }

    // Nunca filtrar detalles internos al cliente (mismo contrato que Python).
    // El log va REDACTADO: Drizzle/Neon incluyen SQL + params en el error y
    // better-auth trae `body` con credenciales.
    console.error("unhandled_error", toSafeErrorLog(error));
    return c.json({ detail: AppError.DETAIL }, 500);
  });

  return app;
}

/** Instancia de producción: storage real (R2) armado por request. */
export const app = createApp();

export default app;
