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
