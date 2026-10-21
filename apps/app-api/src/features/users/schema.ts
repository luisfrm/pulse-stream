import { z } from "@hono/zod-openapi";

/**
 * Contrato público de usuario (paridad con `UserRead` de Python).
 *
 * `role` solo puede ser `"admin"` o `null` (usuario normal). La columna de DB
 * es VARCHAR; la coerción vive acá, nunca en una migración.
 */
export const UserReadSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    is_active: z.boolean(),
    is_verified: z.boolean(),
    is_superuser: z.boolean(),
    role: z.enum(["admin"]).nullable(),
    username: z.string().nullable(),
    cover_key: z.string().nullable(),
    cover_url: z.string().nullable(),
    total_plays: z.number().int(),
  })
  .openapi("UserRead");

export type UserRead = z.infer<typeof UserReadSchema>;
