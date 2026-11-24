"use client";

import * as React from "react";

import { clearPersistedSession } from "@/lib/player/persisted-session";

/**
 * Limpia la sesión del reproductor (`sessionStorage`) al entrar a `/login`.
 *
 * El GET `/api/logout` (lo usan los layouts cuando `getSession()` devuelve
 * null: sesión expirada o guard) y el submit sin JS no pasan por el
 * `LogoutButton`, y el blob no está scopeado por usuario: entrar al login es
 * una frontera de sesión, así que no debe sobrevivir.
 */
export function ClearPlayerSession() {
  React.useEffect(() => {
    clearPersistedSession();
  }, []);
  return null;
}
