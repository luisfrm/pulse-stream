"use client";

import * as React from "react";

/**
 * Registra el service worker manual (public/sw.js). En dev Next sirve la
 * carpeta public/, así que la SW funciona igual; skipWaiting + clients.claim
 * la activan de inmediato tras instalarse.
 */
export function PwaRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed", err));
  }, []);

  return null;
}