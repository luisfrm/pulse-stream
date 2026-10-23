/**
 * Endpoints de `/uploads` (espejo de `features/uploads/router.py`).
 *
 *   POST /uploads/presign        -> URL firmada para AUDIO (cualquier sesión)
 *   POST /uploads/presign-cover  -> URL firmada para COVERS WebP (cualquier sesión)
 *
 * Ambos exigen sesión activa (401 en runtime) y comparten el rate limit
 * `RATE_LIMIT_PRESIGN` (slowapi: `Depends(current_user)` corre ANTES del
 * limiter, así que un anónimo no consume cuota).
 *
 * PARIDAD DE CONTRATO: `responses` = 200 + 422 (los 400/401/429 existen en
 * runtime pero no se documentan, igual que en FastAPI).
 */

import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import type { AppDeps } from "@/deps";
import { storageFor } from "@/deps";
import type { AppEnv } from "@/index";
import { enforceRateLimit, requireUser } from "@/middleware/auth";
import {
  HTTPValidationErrorSchema,
  PresignRequestSchema,
  PresignResponseSchema,
} from "@/schemas";
import { presignAudioUpload, presignCoverUpload } from "@/services/uploads";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const presignResponses = {
  200: {
    description: "Successful Response",
    content: { "application/json": { schema: PresignResponseSchema } },
  },
  422: validationError,
} as const;

const presignRoute = createRoute({
  method: "post",
  path: "/uploads/presign",
  tags: ["uploads"],
  summary: "Presign Upload",
  operationId: "presign_upload_uploads_presign_post",
  description:
    "Firma una URL de subida directa a R2 para AUDIO (5-10 min de validez).",
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PresignRequestSchema } },
    },
  },
  responses: presignResponses,
});

const presignCoverRoute = createRoute({
  method: "post",
  path: "/uploads/presign-cover",
  tags: ["uploads"],
  summary: "Presign Cover",
  operationId: "presign_cover_uploads_presign_cover_post",
  description:
    "Firma una URL de subida directa a R2 para COVERS (solo WebP <= 256 KB,\n" +
    "con Cache-Control inmutable firmado).",
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PresignRequestSchema } },
    },
  },
  responses: presignResponses,
});

export function registerUploadRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  app.openapi(presignRoute, async (c) => {
    const config = c.get("config");
    await enforceRateLimit(c, "presign", config.rateLimits.presign);
    const result = await presignAudioUpload(
      config,
      storageFor(deps, config),
      c.req.valid("json"),
    );
    return c.json(result, 200);
  });

  app.openapi(presignCoverRoute, async (c) => {
    const config = c.get("config");
    await enforceRateLimit(c, "presign-cover", config.rateLimits.presign);
    const result = await presignCoverUpload(
      config,
      storageFor(deps, config),
      c.req.valid("json"),
    );
    return c.json(result, 200);
  });
}
