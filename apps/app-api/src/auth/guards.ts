import type { UserRecord } from "../features/users/repository";
import { UnauthorizedError } from "../lib/errors";
import type { AppContext } from "../types";
import { getSessionCookie } from "./cookies";
import { verifySession } from "./session";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve el usuario de la cookie `session`.
 *
 * Todo fallo (sin cookie, JWT inválido/expirado, `sub` no-UUID, usuario
 * inexistente o inactivo) se traduce a 401 `{detail}`: nunca se filtra si el
 * usuario existe.
 */
export async function requireUser(c: AppContext): Promise<UserRecord> {
  const token = getSessionCookie(c);
  if (!token) throw new UnauthorizedError();

  let subject: string;
  try {
    ({ sub: subject } = await verifySession(token, c.get("config").authSecret));
  } catch {
    throw new UnauthorizedError();
  }

  // Evita mandar basura al cast uuid de Postgres (sería un 500).
  if (!UUID_PATTERN.test(subject)) throw new UnauthorizedError();

  const user = await c.get("users").getById(subject);
  if (!user || !user.is_active) throw new UnauthorizedError();

  return user;
}
