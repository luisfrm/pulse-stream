import { cookies } from "next/headers";
import type { components } from "@pulse-stream/api-types";

export type User = components["schemas"]["UserRead"];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * GET /users/me desde el servidor. Reenvía la cookie de sesión del request
 * del navegador al backend (server-to-server no hay CORS ni SameSite).
 * Devuelve null si no hay sesión válida.
 */
export async function getMe(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Cookie: cookieStore.toString() },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}
