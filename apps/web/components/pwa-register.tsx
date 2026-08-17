"use client";

import * as React from "react";

/**
 * Registra el service worker manual (public/sw.js) SOLO en producción.
 *
 * En dev no se registra: su stale-while-revalidate cachea los chunks de
 * `/_next/static` y el navegador ejecuta código viejo contra el HTML fresco
 * del server → hydration mismatch + errores del bundler RSC de Turbopack
 * (`chunk.reason.enqueueModel`, `Cannot read properties of undefined`).
 * Si quedó un registro de una sesión dev anterior, se desregistra.
 */
export function PwaRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Limpia registros previos en dev para no servir código stale.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) registration.unregister();
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed", err));
  }, []);

  return null;
}
