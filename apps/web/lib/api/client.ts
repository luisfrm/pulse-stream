import {
  createApiClient,
  type ApiFetchOptions,
} from "@pulse-stream/api-client";

export type { ApiFetchOptions };

/**
 * Cliente único e isomórfico de la app hacia la API FastAPI.
 *
 * El factory vive en `@pulse-stream/api-client`: en el servidor reenvía SOLO
 * la cookie de sesión de la app (`SESSION_COOKIE`, default `session`) y en el
 * navegador usa `credentials: "include"`.
 */
export const api = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  cookieName: process.env.SESSION_COOKIE ?? "session",
});

/**
 * Wrapper tipado para aceptar `ApiFetchOptions` (incluye `next`).
 * En runtime delega en la instancia `api` configurada arriba.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  return await api<T>(path, options as Parameters<typeof api<T>>[1]);
}
