import { cache } from "react";

import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { User } from "./types";

/**
 * Sesión actual (GET /users/me). Nunca se cachea entre requests (datos por
 * usuario) pero React.cache deduplica la llamada DENTRO del mismo render:
 * layout + page llaman a getSession y solo sale UN /users/me por request.
 */
export const getSession = cache(async function getSession(
  options?: ApiFetchOptions
): Promise<User | null> {
  try {
    return await api<User>("/users/me", {
      cache: "no-store",
      ...options,
    });
  } catch {
    return null;
  }
});

/** API de sesión (compat: sessionService.getSession se mantiene por si algún
 *  componente cliente lo necesita; en el server usá `getSession` directo). */
export const sessionService = {
  async getSession(options?: ApiFetchOptions): Promise<User | null> {
    return getSession(options);
  },
};
