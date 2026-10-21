import {
  createApiClient,
  type ApiFetchOptions,
} from "@pulse-stream/api-client";

export type { ApiFetchOptions };

/**
 * Cliente del panel hacia la API de administración.
 *
 * En Fase 1 apunta a la misma API Python (`NEXT_PUBLIC_API_URL`) y usa la
 * cookie de sesión que esa API setea (`PANEL_SESSION_COOKIE`, default
 * `session` para no romper el backend actual). En Fase 4 el panel apunta a
 * Hono y la cookie pasa a `panel_session`.
 */
export const panelApi = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  cookieName: process.env.PANEL_SESSION_COOKIE ?? "session",
});
