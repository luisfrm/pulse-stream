/**
 * Registro de `components.schemas` del OpenAPI del worker.
 *
 * Los nombres son EXACTAMENTE los que genera Pydantic en el backend Python:
 * el web consume `components["schemas"]` desde `openapi-typescript`, así que
 * un rename acá rompe el front.
 */

import type { z } from "@hono/zod-openapi";

import { openApiComponents } from "@/schemas";

/** Metadatos del documento (mismos que `FastAPI(title=..., version=...)`). */
export const openApiInfo = {
  title: "Pulse Stream API",
  version: "0.1.0",
} as const;

export const OPENAPI_VERSION = "3.1.0" as const;

/** Lo único que necesitamos del registry (evita acoplarse al tipo interno). */
export interface SchemaRegistry {
  register(name: string, schema: z.ZodType): unknown;
}

/**
 * Registra todos los DTOs como componentes, incluso los que todavía no usa
 * ninguna ruta: `/openapi.json` los expone y `gen:types` los ve.
 */
export function registerOpenApiComponents(registry: SchemaRegistry): void {
  for (const [name, schema] of openApiComponents) {
    registry.register(name, schema);
  }
}
