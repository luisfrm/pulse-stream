/**
 * DTOs de usuario (espejo de `features/users/schemas.py`).
 *
 * Deliberadamente NO se clonan los campos de privilegio que aceptaba el
 * backend Python (`role`, `is_superuser`, `is_active`, `is_verified` en
 * create/update): eran un vector de escalada de privilegios. El rol solo se
 * cambia con `PATCH /admin/users/{id}/role`.
 */

import { z } from "@hono/zod-openapi";

import {
  IntSchema,
  UuidSchema,
  nullableRef,
  nullableUsernameSchema,
  optionalCoverKeySchema,
  optionalUsernameSchema,
} from "./common";

export const UserRoleEnum = z.enum(["admin"]).openapi("UserRole").openapi({ description: "Roles de usuario.\n\nEnums viven SOLO en Pydantic (AGENTS.md) — en la DB la columna es VARCHAR.\n\nSemántica (Fase 2): `role` es **null** para un usuario normal (sin permisos\nespeciales) o el string `\"admin\"` para acceso al panel. No hay más valores." });

export const UserReadSchema = z
  .object({
    id: UuidSchema,
    email: z.email(),
    // Defaults no-None de Pydantic: `default` en el schema y fuera de
    // `required` (así los expone FastAPI y así los lee openapi-typescript).
    is_active: z.boolean().default(true),
    is_superuser: z.boolean().default(false),
    is_verified: z.boolean().default(false),
    role: nullableRef(UserRoleEnum).optional(),
    username: z.string().nullable().optional(),
    cover_key: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    total_plays: IntSchema.default(0),
  })
  .openapi("UserRead").openapi({ description: "Respuesta pública de un usuario. `role` se coerce desde el VARCHAR." });

export const UserCreateSchema = z
  .object({
    email: z.email(),
    password: z.string(),
    username: optionalUsernameSchema(),
  })
  .openapi("UserCreate").openapi({ description: "Registro público: email + password (+ username opcional).\n\nEl rol NO se acepta acá: un usuario no puede auto-asignarse admin.\nEl rol se gestiona solo por un admin (PATCH /admin/users/{id}/role)." });

export const UserUpdateSchema = z
  .object({
    email: z.email().optional(),
    password: z.string().optional(),
    username: nullableUsernameSchema(),
    cover_key: optionalCoverKeySchema(),
  })
  .openapi("UserUpdate").openapi({ description: "Actualización de un usuario (self o admin)." });

export const UserRoleUpdateSchema = z
  .object({
    // Requerido: distingue "no enviado" (422) de "revocar" (null).
    role: nullableRef(UserRoleEnum),
  })
  .openapi("UserRoleUpdate").openapi({ description: "Asignación explícita de rol (admin only).\n\n`role: null` revoca el admin (usuario normal); `role: \"admin\"` lo otorga.\nCampo requerido — distingue \"no enviado\" (422) de \"revocar\" (null)." });

export type UserRead = z.infer<typeof UserReadSchema>;
export type UserCreate = z.infer<typeof UserCreateSchema>;
export type UserUpdate = z.infer<typeof UserUpdateSchema>;
export type UserRoleUpdate = z.infer<typeof UserRoleUpdateSchema>;
export type UserRole = z.infer<typeof UserRoleEnum>;
