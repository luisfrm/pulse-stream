import { api } from "@/lib/api/client";
import type { User } from "./types";

export interface UpdateProfilePayload {
  username?: string;
  /**
   * `null` borra el cover. La API Hono (`PATCH /users/me`) solo acepta
   * `username`/`cover_key`: el email y la contraseña se administran fuera de
   * la app.
   */
  cover_key?: string | null;
}

export interface LoginPayload {
  /** Email o username (case-insensitive). */
  identifier: string;
  password: string;
}

export const authService = {
  /**
   * Login con email o username + contraseña (argon2id en Hono). Setea la
   * cookie `session`.
   */
  login: (payload: LoginPayload) =>
    api<void>("/auth/login", {
      method: "POST",
      body: payload,
    }),

  /** Actualiza el perfil propio (solo username + cover). */
  updateMe: (payload: UpdateProfilePayload) =>
    api<User>("/users/me", {
      method: "PATCH",
      body: payload,
    }),
};
