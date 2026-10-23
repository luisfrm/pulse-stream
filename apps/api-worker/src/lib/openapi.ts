/**
 * Registro de `components.schemas` del OpenAPI del worker.
 *
 * Los nombres son EXACTAMENTE los que genera Pydantic en el backend Python: el
 * web consume `components["schemas"]` desde `openapi-typescript`, así que un
 * rename acá rompe el front.
 *
 * Pydantic además emite `title` en cada componente y en cada propiedad (y
 * `description` cuando el docstring lo define). Ese metadata NO afecta la
 * validación pero `openapi-typescript` lo vuelca como JSDoc, así que para que
 * `generated.ts` sea idéntico hay que reproducirlo:
 *   - las `description` viven en cada schema (se definen con `.openapi(...)`);
 *   - los `title` se agregan al documento en `applyPydanticTitles` (una sola
 *     regla determinista, en vez de `.openapi({ title })` en ~200 campos).
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

/** `true` si el valor es un objeto JSON (no array, no null). */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Título que Pydantic deriva del nombre de un campo:
 * `user_play_count` -> `"User Play Count"` (equivale a
 * `field_name.replace("_", " ").title()`).
 */
export function pydanticFieldTitle(field: string): string {
  return field
    .split("_")
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Título del componente: el nombre tal cual, salvo las páginas genéricas
 * (`Page_SongRead_` -> `"Page[SongRead]"`, como Pydantic).
 */
export function pydanticComponentTitle(name: string): string {
  const page = /^Page_(.+)_$/.exec(name);
  return page ? `Page[${page[1]}]` : name;
}

/**
 * Títulos que FastAPI/Pydantic NO derivan del nombre del campo (aliases de
 * `ValidationError`, que replica los nombres de pydantic-core).
 */
const FIELD_TITLE_OVERRIDES: Record<string, Record<string, string>> = {
  ValidationError: {
    loc: "Location",
    msg: "Message",
    type: "Error Type",
    ctx: "Context",
  },
};

/**
 * Agrega `title` a cada componente y a cada propiedad de primer nivel, igual
 * que Pydantic. Es una normalización del DOCUMENTO (no toca la validación):
 * zod-to-openapi no puede heredar metadata que se setea después de crear el
 * schema, y repetirla a mano en cada campo sería ruido imposible de mantener.
 */
export function applyPydanticTitles(document: unknown): void {
  if (!isJsonObject(document)) return;
  const components = document.components;
  if (!isJsonObject(components)) return;
  const schemas = components.schemas;
  if (!isJsonObject(schemas)) return;

  for (const [name, schema] of Object.entries(schemas)) {
    if (!isJsonObject(schema)) continue;
    schema.title = pydanticComponentTitle(name);

    const properties = schema.properties;
    if (!isJsonObject(properties)) continue;
    const overrides = FIELD_TITLE_OVERRIDES[name] ?? {};

    for (const [field, property] of Object.entries(properties)) {
      if (!isJsonObject(property)) continue;
      // Pydantic NO titula las propiedades que son un modelo (`$ref`) ni una
      // referencia anulable (`anyOf` con `$ref`): solo las tipadas.
      if ("$ref" in property) continue;
      if (Array.isArray(property.anyOf) && property.anyOf.some((part) => isJsonObject(part) && "$ref" in part)) {
        continue;
      }
      property.title = overrides[field] ?? pydanticFieldTitle(field);
    }
  }
}

/** Registra todos los DTOs como componentes (los usa o no alguna ruta). */
export function registerOpenApiComponents(registry: SchemaRegistry): void {
  for (const [name, schema] of openApiComponents) {
    registry.register(name, schema);
  }
}
