/**
 * Sesiones de better-auth (tabla `session`).
 *
 * Solo lo que la API necesita: borrar la sesión que `signUpEmail` crea
 * automáticamente (el registro NO inicia sesión, igual que Python). El resto
 * (crear/renovar/borrar al hacer logout) lo maneja better-auth.
 */

import { eq } from "drizzle-orm";

import { createDb } from "@/db/client";
import { session } from "@/db/schema";
import type { AppConfig } from "@/env";

/** Borra por token (el valor firmado NO es el token: se pasa el crudo). */
export async function deleteSessionByToken(
  config: AppConfig,
  token: string,
): Promise<void> {
  if (!token) return;
  await createDb(config).delete(session).where(eq(session.token, token));
}
