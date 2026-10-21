import { panelApi } from "@/lib/api/client";
import type { User } from "./types";

export const authService = {
  /** /auth/login espera form-urlencoded (OAuth2PasswordRequestForm).
   *  `remember` -> cookie persistente (7 días); sin él, cookie de sesión. */
  login: (email: string, password: string, remember = false) =>
    panelApi<void>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: email,
        password,
        remember: String(remember),
      }),
    }),

  logout: () => panelApi<void>("/auth/logout", { method: "POST" }),

  updateMe: (payload: {
    username?: string;
    email?: string;
    password?: string;
    cover_key?: string;
  }) =>
    panelApi<User>("/users/me", {
      method: "PATCH",
      body: payload,
    }),
};
