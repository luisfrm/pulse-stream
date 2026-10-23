/**
 * Errores de Postgres que la capa de servicio necesita reconocer.
 *
 * Las validaciones de unicidad se hacen ANTES del INSERT (para devolver el
 * `detail` de fastapi-users sin depender del driver), pero dos requests
 * concurrentes pueden pasar el chequeo a la vez: el índice único de la DB es
 * la garantía final y su violación (`23505`) se traduce al MISMO body.
 *
 * Drizzle envuelve el error del driver en `DrizzleQueryError` (`cause`), y el
 * driver HTTP de Neon expone `code`/`constraint`; por eso se camina la cadena
 * de `cause` en lugar de mirar solo el primer nivel.
 */

/**
 * `true` si el error (o alguno de sus `cause`) viene de Postgres/Drizzle.
 *
 * Los errores del driver traen un `code` con el SQLSTATE (`23505`, `23503`,
 * `42P01`...); Drizzle los envuelve en un `DrizzleQueryError` con el original
 * en `cause`. Se camina la cadena igual que `isUniqueViolation`, con una
 * profundidad acotada.
 */
export function isDatabaseError(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;

    const { name, code, cause } = current as {
      name?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    if (name === "DrizzleQueryError") return true;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return true;

    current = cause;
  }

  return false;
}

/** `unique_violation` de Postgres. */
const UNIQUE_VIOLATION = "23505";

/** `true` si el error (o alguno de sus `cause`) es una violación de unicidad. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  // Profundidad acotada: evita un ciclo `cause` patológico.
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;

    const code = (current as { code?: unknown }).code;
    if (code === UNIQUE_VIOLATION) return true;

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
