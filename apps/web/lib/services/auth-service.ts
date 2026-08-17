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

  /** /auth/login espera form-urlencoded (OAuth2PasswordRequestForm). */
  login: (email: string, password: string) =>
    api<void>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    }),

  logout: () => api<void>("/auth/logout", { method: "POST" }),
};
