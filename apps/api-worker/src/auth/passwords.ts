/**
 * Passwords: scrypt de better-auth (`@noble/hashes`, funciona en Workers).
 *
 * En este esquema la password vive en `account.password` (provider
 * `credential`), no en `users.hashed_password` (columna legacy, nullable).
 * `users.hashed_password` queda en NULL para los usuarios nuevos.
 */

import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import type { AppConfig } from "@/env";

export const CREDENTIAL_PROVIDER_ID = "credential";

/**
 * Crea o actualiza la credencial del usuario.
 *
 * UNA sola sentencia (`INSERT ... ON CONFLICT (user_id, provider_id) DO
 * UPDATE`): el driver HTTP de Neon no tiene transacciones interactivas y un
 * SELECT + INSERT/UPDATE tendría carrera (dos requests concurrentes podrían
 * insertar dos filas `credential` del mismo usuario). El `ON CONFLICT` depende
 * del índice único `ux_account_user_provider` (migración 0002).
 *
 * `account.id` es text (uuid) y `account_id` replica el id del usuario, que es
 * lo que better-auth usa para autenticar por email.
 */
export async function setUserPassword(
  config: AppConfig,
  userId: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);

  await createDb(config).execute(sql`
    INSERT INTO "account" (
      "id", "account_id", "provider_id", "user_id", "password",
      "created_at", "updated_at"
    )
    VALUES (
      ${crypto.randomUUID()}, ${userId}, ${CREDENTIAL_PROVIDER_ID},
      ${userId}::uuid, ${passwordHash}, now(), now()
    )
    ON CONFLICT ("user_id", "provider_id") DO UPDATE SET
      "password" = excluded."password",
      "updated_at" = now()
  `);
}
