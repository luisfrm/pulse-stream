import type { Song } from "@/lib/services/types";

/**
 * Descarga offline: guarda el audio COMPLETO en la Cache API para
 * reproducirlo sin stream (y sin conexión). Posible en PWAs de
 * Chrome/Android/desktop; en iOS Safari funciona pero con cuotas de
 * almacenamiento evictables — no es tan confiable como una app nativa.
 */
export const OFFLINE_CACHE = "pulse-offline-v1";

export function canCacheOffline(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

async function offlineCache(): Promise<Cache> {
  return caches.open(OFFLINE_CACHE);
}

/** Descarga la canción completa (fetch CORS a R2) y la guarda en la caché. */
export async function saveSong(song: Song): Promise<void> {
  if (!canCacheOffline() || !song.stream_url) {
    throw new Error("Tu navegador no soporta descargas offline");
  }
  const response = await fetch(song.stream_url, {
    cache: "no-cache",
    mode: "cors",
  });
  if (!response.ok) {
    throw new Error("No se pudo descargar la canción");
  }
  const cache = await offlineCache();
  await cache.put(song.stream_url, response);
}

/** ¿La canción ya está guardada para escucharla offline? */
export async function hasSong(song: Song): Promise<boolean> {
  if (!canCacheOffline() || !song.stream_url) return false;
  const cache = await offlineCache();
  return (await cache.match(song.stream_url)) !== undefined;
}

/** Elimina la canción de la caché offline. */
export async function removeSong(song: Song): Promise<void> {
  if (!canCacheOffline() || !song.stream_url) return;
  const cache = await offlineCache();
  await cache.delete(song.stream_url);
}

/** URLs de las canciones guardadas (para listar "Descargadas"). */
export async function getSavedSongUrls(): Promise<string[]> {
  if (!canCacheOffline()) return [];
  const cache = await offlineCache();
  return (await cache.keys()).map((request) => request.url);
}

/** Espacio usado/disponible del storage del dispositivo (para el UI). */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

/** Toggle de descarga: guarda o borra la canción de la caché offline. */
export async function toggleOffline(song: Song): Promise<boolean> {
  const cached = await hasSong(song);
  if (cached) {
    await removeSong(song);
    return false;
  }
  await saveSong(song);
  return true;
}