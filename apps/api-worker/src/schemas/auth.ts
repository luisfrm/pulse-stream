/**
 * Bodies de `/auth/*` (espejo de los `Body_*` que genera FastAPI).
 *
 * No son componentes: se declaran inline en la operación (igual que en el
 * OpenAPI de Python, donde `Body_...` solo existe porque FastAPI lo nombra).
 * El login es `application/x-www-form-urlencoded` con la firma de
 * `OAuth2PasswordRequestForm` + `remember`.
 */

import { z } from "@hono/zod-openapi";

/** Valores que Pydantic acepta como `True` en un `bool` de form. */
const TRUTHY = new Set(["true", "1", "on", "yes", "t", "y"]);

/** `remember` llega como string desde el form: misma semántica que Pydantic. */
export function parseRemember(value: string | undefined): boolean {
  if (value === undefined) return false;
  return TRUTHY.has(value.trim().toLowerCase());
}

/**
 * Form de login. `username` es el email (fastapi-users autentica por email).
 * `grant_type`/`client_id`/`client_secret` existen solo por compatibilidad con
 * `OAuth2PasswordRequestForm`; el web no los envía. `grant_type` acepta `""`
 * o `"password"` porque el form de OAuth2 lo declara opcional y vacío.
 */
export const LoginFormSchema = z.object({
  username: z.string(),
  password: z.string(),
  remember: z.string().optional(),
  grant_type: z.string().regex(/^(?:password)?$/).optional(),
  scope: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  password: z.string(),
});

export const RequestVerifyTokenSchema = z.object({
  email: z.email(),
});

export const VerifyTokenSchema = z.object({
  token: z.string(),
});

export type LoginForm = z.infer<typeof LoginFormSchema>;
export type ForgotPassword = z.infer<typeof ForgotPasswordSchema>;
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;
export type RequestVerifyToken = z.infer<typeof RequestVerifyTokenSchema>;
export type VerifyToken = z.infer<typeof VerifyTokenSchema>;
