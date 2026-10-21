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

/**
 * `PATCH /users/me` (self-service). Solo username/cover: `role`, email,
 * password, `is_superuser` e `is_active` NO se aceptan (el objeto Zod los
 * descarta antes de llegar al repository). La app es OAuth-only, así que el
 * perfil local nunca cambia credenciales.
 *
 * `username`: `\w` de Python es Unicode → `\p{L}\p{N}_` + `.`, `-` y espacio.
 */
export const USERNAME_PATTERN = /^[\p{L}\p{N}_.\- ]+$/u;

export const UserUpdateSchema = z
  .object({
    username: z
      .string()
      .min(2)
      .max(50)
      .regex(USERNAME_PATTERN),
    cover_key: z
      .string()
      .regex(/^covers\/[0-9a-f-]+\.webp$/)
      .nullable(),
  })
  .partial()
  .openapi("UserUpdate");

export type UserUpdate = z.infer<typeof UserUpdateSchema>;
