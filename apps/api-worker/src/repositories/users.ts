/**
 * Acceso a datos de usuarios (espejo de `features/users/repository.py`).
 *
 * Solo queries Drizzle: sin reglas de negocio ni HTTP. Cada función recibe el
 * `AppConfig` del request y construye su propio cliente (driver HTTP, sin
 * estado entre requests).
 */

import { and, desc, eq, ne, sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import { users, type NewUserRow, type UserRow } from "@/db/schema";
import type { AppConfig } from "@/env";

/** Columnas que la API puede escribir en un usuario existente. */
export type UserPatch = Partial<
  Pick<
    NewUserRow,
    | "email"
    | "username"
    | "coverKey"
    | "role"
    | "isSuperuser"
    | "isActive"
    | "isVerified"
    | "name"
  >
>;

export async function findUserById(
  config: AppConfig,
  id: string,
): Promise<UserRow | null> {
  const rows = await createDb(config)
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(
  config: AppConfig,
  email: string,
): Promise<UserRow | null> {
  const rows = await createDb(config)
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Búsqueda de username case-insensitive (Python: `lower(username) = lower($1)`).
 * `excludeId` ignora al propio usuario al validar un PATCH.
 */
export async function findUserByUsername(
  config: AppConfig,
  username: string,
  excludeId?: string,
): Promise<UserRow | null> {
  const lowered = username.trim().toLowerCase();
  const where = excludeId
    ? and(
        sql`lower(${users.username}) = ${lowered}`,
        ne(users.id, excludeId),
      )
    : sql`lower(${users.username}) = ${lowered}`;

  const rows = await createDb(config).select().from(users).where(where).limit(1);
  return rows[0] ?? null;
}

/** `GET /admin/users`: orden `created_at desc` (igual que Python). */
export async function listUsers(
  config: AppConfig,
  offset: number,
  limit: number,
): Promise<UserRow[]> {
  return createDb(config)
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .offset(offset)
    .limit(limit);
}

/** Hard delete: las FKs `ON DELETE CASCADE` limpian sesiones y contenido. */
export async function deleteUserById(
  config: AppConfig,
  id: string,
): Promise<void> {
  await createDb(config).delete(users).where(eq(users.id, id));
}

/** UPDATE parcial + `updated_at` (SQLAlchemy lo hacía con `onupdate`). */
export async function updateUserById(
  config: AppConfig,
  id: string,
  patch: UserPatch,
): Promise<UserRow | null> {
  if (Object.keys(patch).length === 0) return findUserById(config, id);

  const rows = await createDb(config)
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return rows[0] ?? null;
}
