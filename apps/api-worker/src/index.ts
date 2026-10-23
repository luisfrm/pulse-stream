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
import { OPENAPI_VERSION, openApiInfo, registerOpenApiComponents } from "@/lib/openapi";
import { fastApiValidationHook, toFastApiValidationError } from "@/lib/validate";
import { requireTrustedOrigin } from "@/middleware/origin";
import { registerAdminUserRoutes } from "@/routes/admin-users";
import { registerAlbumRoutes } from "@/routes/albums";
import { registerArtistRoutes } from "@/routes/artists";
import { registerAuthRoutes } from "@/routes/auth";
import { registerGenreRoutes } from "@/routes/genres";
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

/**
 * Fija el nombre de la cookie del esquema `APIKeyCookie` del documento
 * OpenAPI. El registry de `@hono/zod-openapi` es estático (se arma al crear la
 * app) y `SESSION_COOKIE_NAME` es por request, así que se ajusta acá.
 */
function applySessionCookieName(document: unknown, name: string): void {
  if (typeof document !== "object" || document === null) return;
  if (!("components" in document)) return;
  const components: unknown = document.components;
  if (typeof components !== "object" || components === null) return;
  if (!("securitySchemes" in components)) return;
  const schemes: unknown = components.securitySchemes;
  if (typeof schemes !== "object" || schemes === null) return;
  if (!("APIKeyCookie" in schemes)) return;
  const scheme: unknown = schemes.APIKeyCookie;
  if (typeof scheme !== "object" || scheme === null) return;

  (scheme as { name?: string }).name = name;
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

  app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));

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

  // /openapi.json y /docs existen solo en local (igual que `docs_url` en la
  // API Python); fuera de local caen al 404 JSON del `notFound`.
  app.get("/openapi.json", (c) => {
    const config = c.get("config");
    if (!config.docsEnabled) {
      return c.json({ detail: "Not Found" }, 404);
    }

    const document = app.getOpenAPI31Document({
      openapi: OPENAPI_VERSION,
      info: openApiInfo,
    });
    // El nombre de la cookie de sesión sale de `SESSION_COOKIE_NAME`, no de
    // una constante: el registry es estático y el env es por request.
    applySessionCookieName(document, config.cookie.name);
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
    console.error("unhandled_error", error);
    return c.json({ detail: AppError.DETAIL }, 500);
  });

  return app;
}

/** Instancia de producción: storage real (R2) armado por request. */
export const app = createApp();

export default app;
