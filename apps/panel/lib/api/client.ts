import {
  createApiClient,
  type ApiFetchOptions,
} from "@pulse-stream/api-client";

export type { ApiFetchOptions };

/**
 * Cliente del panel hacia la API de administración (FastAPI, `apps/api`).
 *
 * Desde la Fase 4 la app (`apps/web`) habla con Hono y el panel sigue 100%
 * contra Python. La cookie del panel es `PANEL_SESSION_COOKIE` (default
 * `panel_session`): en local no comparte sesión con la cookie `session` de
 * Hono. El Python local debe correr con `SESSION_COOKIE_NAME=panel_session`.
 */
export const panelApi = createApiClient({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
    "http://localhost:8000",
  cookieName: process.env.PANEL_SESSION_COOKIE ?? "panel_session",
});
