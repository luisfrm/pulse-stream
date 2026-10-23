/**
 * Componentes de error del contrato (los mismos que emite FastAPI).
 *
 * `ErrorModel` es el body `{"detail": "..."}` que devuelven los endpoints
 * autenticados; `HTTPValidationError`/`ValidationError` documentan el 422 de
 * Pydantic. El web los consume vía `openapi-typescript`.
 */

import { z } from "@hono/zod-openapi";

/**
 * `{"detail": "CODE" | {"code": "...", "reason": "..."}}`.
 * Espeja `fastapi_users.router.common.ErrorModel`.
 */
export const ErrorModelSchema = z
  .object({
    detail: z.union([z.string(), z.record(z.string(), z.string())]),
  })
  .openapi("ErrorModel");

/**
 * Un issue de validación.
 *
 * `input` es `Any` en Pydantic (sin `type`), así que se documenta como `{}`.
 * `ctx` es un objeto sin propiedades declaradas (`Record<string, never>` en TS):
 * el `.openapi({ type: "object" })` fuerza el `{}` de Pydantic (sin
 * `additionalProperties`).
 */
export const ValidationErrorSchema = z
  .object({
    loc: z.array(z.union([z.string(), z.int()])),
    msg: z.string(),
    type: z.string(),
    input: z.any().optional(),
    ctx: z.record(z.string(), z.any()).optional().openapi({ type: "object" }),
  })
  .openapi("ValidationError");

/** `{"detail": [ValidationError, ...]}` (422 de FastAPI). */
export const HTTPValidationErrorSchema = z
  .object({
    detail: z.array(ValidationErrorSchema).optional(),
  })
  .openapi("HTTPValidationError");

export type ErrorModel = z.infer<typeof ErrorModelSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type HTTPValidationError = z.infer<typeof HTTPValidationErrorSchema>;
