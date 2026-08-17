import { ofetch } from "ofetch";

import type { ApiFetchOptions } from "./types";

export type { ApiFetchOptions };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const isServer = typeof window === "undefined";

/**
 * Cliente único e isomórfico hacia la API FastAPI.
 *
 * - Servidor (RSC / Server Action): propaga las cookies del request del
 *   navegador vía `next/headers` — así la sesión viaja en cada fetch.
 * - Navegador (Client Component): `credentials: "include"` para que el browser
 *   mande las cookies solas.
 *
 * Soporta `next: { revalidate, tags }` para el cache tagging de Next 16.
 */
export const api = ofetch.create({
  baseURL: API_URL,
  retry: 1,
  timeout: 30_000,

  async onRequest({ options }) {
    if (isServer) {
      // Lectura en RSC / Server Action: reenviar cookie del request entrante
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      options.headers = new Headers(options.headers);
      options.headers.set("cookie", cookieStore.toString());
    } else {
      // En el navegador las cookies viajan solas con la request
      options.credentials = "include";
    }
  },
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
