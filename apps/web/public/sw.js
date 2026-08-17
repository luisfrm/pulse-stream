/* Pulse Stream — Service Worker manual (sin integración de build).
 *
 * Estrategia:
 * - Navegación: network-first, con fallback al app shell cacheado ('/')
 *   para que la PWA abra sin conexión.
 * - Estáticos del mismo origen: stale-while-revalidate.
 * - Audio descargado (caché "pulse-offline-v1"): cache-first por URL exacta.
 *   El botón "Descargar" del reproductor guarda el fetch completo de la
 *   canción en esa caché; acá servimos el archivo sin red, sin importar el host.
 */
const OFFLINE_CACHE = "pulse-offline-v1";
const SHELL_CACHE = "pulse-shell-v1";
const CORE_ASSETS = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== OFFLINE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isOfflineAsset(request) {
  return request.method === "GET" && (request.destination === "audio" || /\.(mp3|m4a|aac|ogg|wav)$/i.test(request.url));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET
  if (request.method !== "GET") return;

  // Audio descargado offline -> cache-first por URL exacta
  if (isOfflineAsset(request)) {
    event.respondWith(
      caches.open(OFFLINE_CACHE).then(async (cache) => {
        const cached = await cache.match(request.url);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          return response;
        } catch {
          return new Response("", { status: 504, statusText: "Offline sin descarga previa" });
        }
      })
    );
    return;
  }

  // Navegación -> network-first con app shell como fallback
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(request.url, copy))
            .catch(() => {});
          return response;
        })
        .catch(() =>
          caches.open(SHELL_CACHE).then((cache) => cache.match("/") || cache.match(request.url))
        )
    );
    return;
  }

  // Estáticos del mismo origen -> stale-while-revalidate
  if (request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request.url);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              cache.put(request.url, copy).catch(() => {});
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});