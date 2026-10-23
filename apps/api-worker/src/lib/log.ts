/**
 * Redacción de errores para logs.
 *
 * NUNCA se loguea el error crudo: los de Drizzle/Neon traen la SQL y los
 * parámetros (emails, tokens), y los `APIError` de better-auth traen `body`
 * (respuestas con credenciales). Solo se extraen campos seguros y acotados.
 */

/** Campos que se loguean de un error (todos primitivos). */
export interface SafeErrorLog {
  name: string;
  message: string;
  code?: string;
  stack?: string;
}

/** Máximo de caracteres del stack (evita log lines gigantes). */
const MAX_STACK_LENGTH = 2_000;

/** `true` si el valor es un objeto con índice string. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Convierte cualquier `unknown` en un objeto plano apto para logs.
 *
 * NO incluye `cause`, `body`, `query`, `params` ni `sql`: son justamente los
 * que filtran datos sensibles.
 */
export function toSafeErrorLog(error: unknown): SafeErrorLog {
  if (!isRecord(error)) {
    return { name: typeof error, message: String(error) };
  }

  const name = typeof error.name === "string" ? error.name : "Error";
  const message = typeof error.message === "string" ? error.message : String(error);

  const safe: SafeErrorLog = { name, message };

  // SQLSTATE de Postgres (5 caracteres) o el `code` de better-auth.
  if (typeof error.code === "string") safe.code = error.code;

  if (typeof error.stack === "string") {
    safe.stack = error.stack.slice(0, MAX_STACK_LENGTH);
  }

  return safe;
}
