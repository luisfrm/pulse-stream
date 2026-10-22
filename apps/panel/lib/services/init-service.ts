import { cache } from "react";

import type { components } from "@pulse-stream/api-types";

import { panelApi, type ApiFetchOptions } from "@/lib/api/client";
import type { User } from "./types";

export type InitStatus = components["schemas"]["InitStatusRead"];
export type InitPayload = components["schemas"]["InitCreate"];

/**
 * Estado del bootstrap del panel (`GET /init/status`).
 *
 * `React.cache` deduplica la llamada dentro del mismo request (layout + page).
 * Si la API no responde, asumimos `needs_init: false`: el login se muestra
 * igual y el error real aparece al enviar credenciales.
 */
export const getInitStatus = cache(async function getInitStatus(
  options?: ApiFetchOptions,
): Promise<InitStatus> {
  try {
    return await panelApi<InitStatus>("/init/status", {
      cache: "no-store",
      ...options,
    });
  } catch {
    return { needs_init: false };
  }
});

export const initService = {
  getStatus: getInitStatus,

  /** Crea el primer admin (solo si el panel no tiene cuentas). */
  async init(payload: InitPayload): Promise<User> {
    return await panelApi<User>("/init", {
      method: "POST",
      body: payload,
    });
  },
};
