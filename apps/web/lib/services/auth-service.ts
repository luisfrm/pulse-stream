import { api } from "@/lib/api/client";
import type { User } from "./types";

export interface RegisterPayload {
  email: string;
  password: string;
  username?: string;
}

export interface UpdateProfilePayload {
  username?: string;
  email?: string;
  password?: string;
  cover_key?: string;
}

export const authService = {
  register: (payload: RegisterPayload) =>
    api<User>("/auth/register", {
      method: "POST",
      body: payload,
    }),

  /** Actualiza el perfil propio (username, email, password, cover). */
  updateMe: (payload: UpdateProfilePayload) =>
    api<User>("/users/me", {
      method: "PATCH",
      body: payload,
    }),

  /** /auth/login espera form-urlencoded (OAuth2PasswordRequestForm).
   *  `remember` -> cookie persistente (7 días); sin él, cookie de sesión. */
  login: (email: string, password: string, remember = false) =>
    api<void>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: email,
        password,
        remember: String(remember),
      }),
    }),

  /**
   * Pide el mail de reset. Responde 202 SIEMPRE (no revela si el email
   * existe), así que el mensaje de la UI es condicional.
   */
  forgotPassword: (email: string) =>
    api<null>("/auth/forgot-password", { method: "POST", body: { email } }),

  /** Canjea el token del mail (`/reset-password?token=...`) por una nueva password. */
  resetPassword: (token: string, password: string) =>
    api<null>("/auth/reset-password", { method: "POST", body: { token, password } }),

  logout: () => api<void>("/auth/logout", { method: "POST" }),
};
