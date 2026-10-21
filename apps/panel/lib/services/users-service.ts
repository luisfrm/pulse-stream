import { panelApi, type ApiFetchOptions } from "@/lib/api/client";
import type { User } from "./types";

/**
 * Administración de usuarios (`/admin/users`). El backend hoy no tiene UI en el
 * panel: el servicio queda listo para la pantalla de usuarios y lo usan los
 * tests de contrato admin.
 */
export const usersService = {
  async listUsers(
    params?: { offset?: number; limit?: number },
    options?: ApiFetchOptions,
  ): Promise<User[]> {
    return await panelApi<User[]>("/admin/users", {
      query: params,
      cache: "no-store",
      ...options,
    });
  },

  async deleteUser(id: string): Promise<void> {
    await panelApi(`/admin/users/${id}`, { method: "DELETE" });
  },

  async setRole(id: string, role: "admin" | null): Promise<User> {
    return await panelApi<User>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: { role },
    });
  },
};
