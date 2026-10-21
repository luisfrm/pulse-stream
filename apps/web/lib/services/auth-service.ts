import { api } from "@/lib/api/client";
import type { User } from "./types";

export interface UpdateProfilePayload {
  username?: string;
  /**
   * `null` borra el cover. La API Hono (`PATCH /users/me`) solo acepta
   * `username`/`cover_key`: el email lo gestiona Google y la contraseña no se
   * edita desde la app (el login por password es para cuentas existentes).
   */
  cover_key?: string | null;
}

export interface LoginPayload {
  /** Email o username (case-insensitive). */
  identifier: string;
  password: string;
}

/** Base de la API Hono de la app (local :8787 / prod api.luisrivas.site). */
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"
).replace(/\/+$/, "");

export const authService = {
  /**
   * URL del flow OAuth de Google en la API Hono. El backend valida `returnTo`
   * (solo paths internos: `//`, `\` y esquemas caen a `/dashboard`), setea el
   * `oauth_state` (state + PKCE) y redirige a Google.
   */
  googleAuthUrl(returnTo = "/dashboard"): string {
    return `${API_BASE_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  },

  /**
   * Login con email o username + contraseña (argon2id en Hono). Setea la misma
   * cookie `session` que Google. Los usuarios creados solo con Google no tienen
   * password: para ellos el único acceso es Google.
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
