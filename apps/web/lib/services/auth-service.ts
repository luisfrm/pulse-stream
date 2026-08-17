import { api } from "@/lib/api/client";
import type { User } from "./types";

export const authService = {
  register: (email: string, password: string) =>
    api<User>("/auth/register", {
      method: "POST",
      body: { email, password },
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
