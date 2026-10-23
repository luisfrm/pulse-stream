/**
 * Bodies de `/auth/*` (espejo de los `Body_*` que genera FastAPI).
 *
 * A diferencia de los DTOs, estos SÍ son componentes con el nombre exacto que
 * emite FastAPI (`Body_<operationId>`): el OpenAPI de Python los referencia con
 * `$ref` y `openapi-typescript` genera `components["schemas"]["Body_..."]`, así
 * que el Worker tiene que registrar los mismos nombres para ser drop-in.
 *
 * El login es `application/x-www-form-urlencoded` con la firma de
 * `OAuth2PasswordRequestForm` + `remember`. Los valores del form llegan como
 * strings: `remember` se coacciona a bool en runtime y se documenta como
 * boolean (como Pydantic).
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
 * `OAuth2PasswordRequestForm`; el web no los envía.
 */
export const LoginBodySchema = z
  .object({
    // Orden de `OAuth2PasswordRequestForm` (el mismo del OpenAPI de Python):
    // recordar que el orden de propiedades se preserva en `generated.ts`.
    remember: z
      .preprocess(
        (value) =>
          typeof value === "string"
            ? TRUTHY.has(value.trim().toLowerCase())
            : value,
        z.boolean().default(false),
      )
      .openapi({ type: "boolean", default: false }),
    grant_type: z
      .string()
      .regex(/^password$/)
      .nullable()
      .optional()
      .openapi({ format: undefined }),
    username: z.string(),
    password: z.string().openapi({ format: "password" }),
    scope: z.string().default(""),
    client_id: z.string().nullable().optional(),
    // Sin `format: password`: el metadata sobre un nullable pisa el `anyOf` y
    // rompe la forma normalizada del componente (Python lo pone en el nodo
    // externo del anyOf, que no afecta el tipo TS).
    client_secret: z.string().nullable().optional(),
  })
  .openapi("Body_auth_cookie_login_auth_login_post");

export const ForgotPasswordSchema = z
  .object({
    email: z.email(),
  })
  .openapi("Body_reset_forgot_password_auth_forgot_password_post");

export const ResetPasswordSchema = z
  .object({
    token: z.string(),
    password: z.string(),
  })
  .openapi("Body_reset_reset_password_auth_reset_password_post");

export const RequestVerifyTokenSchema = z
  .object({
    email: z.email(),
  })
  .openapi("Body_verify_request_token_auth_request_verify_token_post");

export const VerifyTokenSchema = z
  .object({
    token: z.string(),
  })
  .openapi("Body_verify_verify_auth_verify_post");

export type LoginBody = z.infer<typeof LoginBodySchema>;
export type ForgotPassword = z.infer<typeof ForgotPasswordSchema>;
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;
export type RequestVerifyToken = z.infer<typeof RequestVerifyTokenSchema>;
export type VerifyToken = z.infer<typeof VerifyTokenSchema>;
