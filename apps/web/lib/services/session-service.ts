import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { User } from "./types";

export const sessionService = {
  /**
   * Sesión actual (GET /users/me). Nunca se cachea (datos por usuario);
   * devuelve null si no hay sesión válida o hay error de red.
   */
  async getSession(options?: ApiFetchOptions): Promise<User | null> {
    try {
      return await api<User>("/users/me", {
        cache: "no-store",
        ...options,
      });
    } catch {
      return null;
    }
  },
};
