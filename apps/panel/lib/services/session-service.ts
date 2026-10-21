import { cache } from "react";

import { panelApi, type ApiFetchOptions } from "@/lib/api/client";
import type { User } from "./types";

/**
 * Sesión actual del panel (GET /users/me contra la API Python). Nunca se
 * cachea entre requests (datos por usuario) pero React.cache deduplica la
 * llamada DENTRO del mismo render: layout + page llaman a getSession y solo
 * sale UN /users/me.
 */
export const getSession = cache(async function getSession(
  options?: ApiFetchOptions
): Promise<User | null> {
  try {
    return await panelApi<User>("/users/me", {
      cache: "no-store",
      ...options,
    });
  } catch {
    return null;
  }
});

/** API de sesión (compat para componentes cliente). */
export const sessionService = {
  async getSession(options?: ApiFetchOptions): Promise<User | null> {
    return getSession(options);
  },
};
