/**
 * Tokens de verificación de better-auth (tabla `verification`).
 *
 * Solo lo que la API necesita del flujo de reset: invalidar los links
 * anteriores antes de emitir uno nuevo. Una sola sentencia (el driver HTTP de
 * Neon no soporta transacciones interactivas).
 */

import { sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import type { AppConfig } from "@/env";

/** Borra los tokens de reset pendientes: solo el último link debe servir. */
export async function deletePasswordResetTokens(
  config: AppConfig,
  userId: string,
): Promise<void> {
  await createDb(config).execute(sql`
    DELETE FROM "verification"
    WHERE "value" = ${userId} AND "identifier" LIKE 'reset-password:%'
  `);
}
