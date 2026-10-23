/**
 * App Hono del Worker — espejo de `apps/api/app/main.py`.
 *
 * F0: CORS con credenciales, error handler con el body de FastAPI,
 * `/health`, `/openapi.json` y `/docs` (solo en local), 404 JSON.
 * Los 64 endpoints se montan en fases posteriores sobre este mismo `app`.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

import { createConfig, type AppConfig, type Bindings } from "@/env";
import { AppError, isAppError } from "@/lib/errors";
import { isAllowedOrigin } from "@/lib/cors";
import { OPENAPI_VERSION, openApiInfo, registerOpenApiComponents } from "@/lib/openapi";
import { fastApiValidationHook, toFastApiValidationError } from "@/lib/validate";

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    config: AppConfig;
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

export function createApp() {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: fastApiValidationHook });

  registerOpenApiComponents(app.openAPIRegistry);

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

  app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));

  // /openapi.json y /docs existen solo en local (igual que `docs_url` en la
  // API Python); fuera de local caen al 404 JSON del `notFound`.
  app.get("/openapi.json", (c) => {
    if (!c.get("config").docsEnabled) {
      return c.json({ detail: "Not Found" }, 404);
    }
    return c.json(
      app.getOpenAPI31Document({ openapi: OPENAPI_VERSION, info: openApiInfo }),
    );
  });

  app.get("/docs", (c) => {
    if (!c.get("config").docsEnabled) {
      return c.json({ detail: "Not Found" }, 404);
    }
    return c.html(docsHtml("/openapi.json"));
  });

  app.notFound((c) => c.json({ detail: "Not Found" }, 404));

  app.onError((error, c) => {
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

export const app = createApp();

export default app;
