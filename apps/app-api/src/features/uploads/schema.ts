import { z } from "@hono/zod-openapi";

/**
 * Contrato de `/uploads/presign-cover` (espejo de `PresignRequest` /
 * `PresignResponse` de Python).
 *
 * `filename` es opcional: el front lo manda por compatibilidad, pero el
 * service de covers no lo usa (la key la genera el backend con UUID).
 */
export const PresignCoverRequestSchema = z.object({
  filename: z.string().min(1).max(255).optional(),
  content_type: z.string(),
  size: z.number().int().min(0),
});

export const PresignCoverResponseSchema = z
  .object({
    url: z.string(),
    object_key: z.string(),
    content_type: z.string(),
    expires_in: z.number().int(),
  })
  .openapi("PresignResponse");

export type PresignCoverRequest = z.infer<typeof PresignCoverRequestSchema>;
export type PresignCoverResponse = z.infer<
  typeof PresignCoverResponseSchema
>;
