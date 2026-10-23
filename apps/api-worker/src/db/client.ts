/**
 * Cliente Drizzle sobre el driver HTTP de Neon.
 *
 * Sin transacciones interactivas (el driver HTTP no las soporta): una sola
 * sentencia por operación o compensación explícita en el `catch`.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import type { AppConfig } from "@/env";
import { requireDatabaseUrl } from "@/env";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

export function createDb(config: AppConfig): Database {
  // Falla con un error claro en español si falta el binding (no "" silencioso).
  const sql = neon(requireDatabaseUrl(config));
  return drizzle(sql, { schema });
}
