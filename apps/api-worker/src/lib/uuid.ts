/**
 * Parseo de uuid con la semántica de `uuid.UUID()` de Python.
 *
 * FastAPI declara los ids como `uuid.UUID`, que NO es el `format: uuid` de
 * zod: además de la forma canónica con guiones acepta 32 hex sin guiones, la
 * forma entre llaves y el prefijo `urn:uuid:` (todo case-insensitive), y
 * normaliza a la forma canónica en minúsculas antes de usarlo.
 *
 * Importa por dos motivos:
 *   - Postgres solo castea la forma canónica o los 32 hex: si la ruta llega en
 *     mayúsculas o con llaves, la query fallaría con un 500 en vez de resolver.
 *   - El `detail` de los 404 arma el mensaje con el id: Python lo muestra ya
 *     canonicalizado (`Artista <uuid> no existe`), no con la forma de entrada.
 *
 * `UuidSchema` (`schemas/common.ts`) usa este helper y mantiene `format: uuid`
 * en el OpenAPI + `uuid_parsing` en el 422, igual que Pydantic.
 */

/** Forma canónica: 8-4-4-4-12 en minúsculas y con guiones. */
export const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `uuid.UUID(str)` canónico, o `null` si el valor no es un uuid.
 *
 * Replica el parseo de CPython: quita `urn:`/`uuid:`, las llaves de los
 * extremos y TODOS los guiones, y exige 32 dígitos hex.
 */
export function normalizeUuid(raw: string): string | null {
  const hex = raw
    .trim()
    .replace(/urn:/gi, "")
    .replace(/uuid:/gi, "")
    .replace(/^\{+/, "")
    .replace(/\}+$/, "")
    .replace(/-/g, "")
    .toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(hex)) return null;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
