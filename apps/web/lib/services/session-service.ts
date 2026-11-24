import { cache } from "react";

import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { User } from "./types";

/** `true` sólo para el 401 de "no hay sesión" (ofetch: `error.response.status`). */
function isUnauthorized(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const response = (error as { response?: { status?: number } }).response;
  return response?.status === 401;
}

/**
 * Sesión actual (GET /users/me). Nunca se cachea entre requests (datos por
 * usuario) pero React.cache deduplica la llamada DENTRO del mismo render:
 * layout + page llaman a getSession y solo sale UN /users/me por request.
 *
 * Sólo el 401 significa "sin sesión" (→ `null`, el anónimo). Cualquier otro
 * error (red, 500, timeout) se PROPAGA: el layout protegido redirige a
 * `/api/logout` cuando ve `null`, así que un blip transitorio deslogueaba al
 * usuario. El throw cae en el `error.tsx` del área (reintento) sin tocar la
 * cookie de sesión.
 */
export const getSession = cache(async function getSession(
  options?: ApiFetchOptions
): Promise<User | null> {
  try {
    return await api<User>("/users/me", {
      cache: "no-store",
      ...options,
    });
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }
});

/** API de sesión (compat: sessionService.getSession se mantiene por si algún
 *  componente cliente lo necesita; en el server usá `getSession` directo). */
export const sessionService = {
  async getSession(options?: ApiFetchOptions): Promise<User | null> {
    return getSession(options);
  },
};
