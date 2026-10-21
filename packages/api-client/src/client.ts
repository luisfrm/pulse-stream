import { ofetch } from "ofetch";

const isServer = typeof window === "undefined";

export interface ApiClientOptions {
  /**
   * URL base de la API (p. ej. `process.env.NEXT_PUBLIC_API_URL`).
   * Sin valor, ofetch usa URLs relativas (no aplica para este proyecto).
   */
  baseURL?: string;
  /**
   * Cookie HttpOnly que se reenvía desde el request entrante en el servidor.
   * La app usa `SESSION_COOKIE`; el panel `PANEL_SESSION_COOKIE`. NUNCA se
   * reenvían todas las cookies (el panel no debe mandar cookies de la app).
   */
  cookieName?: string;
  timeout?: number;
}

/**
 * Crea un cliente isomórfico hacia una API (Hono para la app; FastAPI para el
 * panel).
 *
 * - Servidor (RSC / Server Action): propaga SOLO la cookie indicada vía
 *   `next/headers`.
 * - Navegador (Client Component): `credentials: "include"` para que el
 *   browser mande la cookie de sesión.
 *
 * Soporta `next: { revalidate, tags }` para el cache tagging de Next 16.
 */
export function createApiClient({
  baseURL,
  cookieName,
  timeout = 30_000,
}: ApiClientOptions) {
  return ofetch.create({
    baseURL,
    retry: 1,
    timeout,

    async onRequest({ options }) {
      if (isServer) {
        if (!cookieName) return;
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const value = cookieStore.get(cookieName)?.value;
        if (!value) return;
        options.headers = new Headers(options.headers);
        options.headers.set("cookie", `${cookieName}=${value}`);
      } else {
        // En el navegador las cookies viajan solas con la request
        options.credentials = "include";
      }
    },
  });
}
