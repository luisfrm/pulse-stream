/**
 * Helpers compartidos por los DTOs.
 */

import { z } from "@hono/zod-openapi";

import { CANONICAL_UUID_REGEX, normalizeUuid } from "@/lib/uuid";

/**
 * Key de un cover emitida por el presign (`covers/{uuid}.webp`).
 * Única fuente: artists/albums/playlists/users la reusan para rechazar el
 * bypass de un PATCH/POST directo con una key arbitraria.
 */
export const COVER_KEY_REGEX = /^covers\/[0-9a-f-]+\.webp$/;

/**
 * Patrón de username. Python usa `^[\w.\- ]+$` con `re.UNICODE` por defecto,
 * así que `\w` incluye letras/dígitos Unicode (no solo ASCII): replicamos esa
 * semántica con `\p{L}\p{N}` + `_`.
 */
export const USERNAME_REGEX = /^[\p{L}\p{N}_.\- ]+$/u;

/**
 * UUID con la semántica de `uuid.UUID()` de Python (no la estricta de zod:
 * Python acepta 32 hex sin guiones, llaves y `urn:uuid:`).
 *
 * `z.preprocess` canonicaliza la entrada a minúsculas con guiones; el
 * `z.stringFormat("uuid", ...)` de adentro conserva `format: uuid` en el
 * OpenAPI (el contrato del web) y emite `uuid_parsing` en el 422. Un valor que
 * no es uuid pasa tal cual y falla el formato, igual que Pydantic.
 */
export const UuidSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? (normalizeUuid(value) ?? value) : value,
  z.stringFormat("uuid", CANONICAL_UUID_REGEX),
);
export const DateTimeSchema = z.iso.datetime();
export const IntSchema = z.int();

/**
 * `T | null` para schemas que ya tienen `refId` (`.openapi("Name")`).
 *
 * OJO: no usar `.nullable()` sobre un schema con refId — zod-to-openapi
 * re-registra el componente con el `null` incluido y corrompe el contrato
 * (`UserRole` pasaría a ser `["admin", null]`). La unión genera
 * `anyOf: [$ref, {type: "null"}]`, igual que Pydantic.
 */
export function nullableRef<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.null()]);
}

/** `cover_key` de escritura (solo keys del presign). */
export function coverKeySchema() {
  return z.string().regex(COVER_KEY_REGEX);
}

/** `cover_key` opcional de escritura: ausente o `null` no cambia nada. */
export function optionalCoverKeySchema() {
  return coverKeySchema().nullable().optional();
}

/** Username opcional con el patrón de Python (2..50). */
export function optionalUsernameSchema() {
  return z.string().min(2).max(50).regex(USERNAME_REGEX).optional();
}

/** Username opcional que además acepta `null` (PATCH). */
export function nullableUsernameSchema() {
  return z.string().min(2).max(50).regex(USERNAME_REGEX).nullable().optional();
}

function pageShape<T extends z.ZodType>(item: T) {
  return {
    items: z.array(item),
    total: IntSchema,
    offset: IntSchema,
    limit: IntSchema,
  };
}

/**
 * Page<T> de la paginación offset/limit.
 * Pydantic nombra el componente `Page_<Item>_` (con guion bajo final) porque
 * el schema es genérico; replicamos ese nombre para que `openapi-typescript`
 * genere exactamente los mismos tipos que el backend Python.
 */
export function pageSchema<T extends z.ZodType>(item: T, itemName: string) {
  return z.object(pageShape(item)).openapi(`Page_${itemName}_`);
}
