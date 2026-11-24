import type { Song } from "@/lib/services/types";

/**
 * Sesión liviana del reproductor en `sessionStorage` (por pestaña, sin DB ni
 * cookies): sobrevive a un F5 pero no a cerrar la pestaña.
 */
export const PLAYER_SESSION_KEY = "pulse-player-v1";

const VERSION = 1;
/** Tope de cola persistida: el resto se recorta alrededor de la actual. */
const MAX_QUEUE = 300;
/** Tope del historial persistido (`playedIds`): el más reciente. */
const MAX_PLAYED = 100;
/** Reintento mínimo ante cuota: últimas 20 alrededor de la actual. */
const MIN_QUEUE = 20;

export interface PersistedSession {
  v: 1;
  savedAt: number;
  currentId: string;
  /** Cola materializada SIN letras (el texto puede ser enorme). */
  queue: Song[];
  progress: number;
  duration: number;
  contextLabel: string | null;
  playedIds: string[];
}

/** Lo que el provider entrega para guardar (la versión y el timestamp van acá). */
export type SessionSnapshot = Omit<PersistedSession, "v" | "savedAt">;

/** Storage accesible, o `null` si el navegador lo bloquea (privado/iframe). */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Partial<PersistedSession>;
  return (
    data.v === VERSION &&
    Array.isArray(data.queue) &&
    data.queue.length > 0 &&
    typeof data.currentId === "string" &&
    data.queue.some((song) => song?.id === data.currentId) &&
    typeof data.progress === "number" &&
    typeof data.duration === "number" &&
    (data.contextLabel === null || typeof data.contextLabel === "string") &&
    Array.isArray(data.playedIds)
  );
}

/**
 * Lee la sesión guardada. Cualquier cosa inválida (JSON roto, versión vieja,
 * `currentId` fuera de la cola) borra la entrada y devuelve `null`: el player
 * arranca limpio en vez de con un estado a medias.
 */
export function readPersistedSession(): PersistedSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PLAYER_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedSession(parsed)) {
      clearPersistedSession();
      return null;
    }
    return parsed;
  } catch {
    clearPersistedSession();
    return null;
  }
}

/** Ventana alrededor de la canción actual (el `currentId` queda adentro). */
function windowQueue(queue: Song[], currentId: string): Song[] {
  if (queue.length <= MAX_QUEUE) return queue;
  const index = queue.findIndex((song) => song.id === currentId);
  const center = index >= 0 ? index : 0;
  return queue.slice(Math.max(0, center - 100), center + 150);
}

/** Último recurso ante cuota: ~20 canciones que incluyen la actual. */
function minQueue(queue: Song[], currentId: string): Song[] {
  const index = queue.findIndex((song) => song.id === currentId);
  const center = index >= 0 ? index : queue.length - 1;
  return queue.slice(Math.max(0, center - (MIN_QUEUE - 1)), center + 1);
}

/**
 * Persiste la sesión. Serializa las canciones con `lyrics: null` (el texto puede
 * pesar cientos de KB) y recorta la cola si supera `MAX_QUEUE`. Nunca rompe el
 * player: ante `QuotaExceededError` reintenta con la cola mínima y, si tampoco
 * entra, limpia la entrada y sigue.
 */
export function writePersistedSession(data: SessionSnapshot): void {
  const store = storage();
  if (!store) return;

  const serialize = (queue: Song[]) =>
    JSON.stringify({
      v: VERSION,
      savedAt: Date.now(),
      ...data,
      queue: queue.map((song) => ({ ...song, lyrics: null })),
      // Historial acotado a los 100 más recientes (orden de inserción).
      playedIds: data.playedIds.slice(-MAX_PLAYED),
    } satisfies PersistedSession);

  try {
    store.setItem(
      PLAYER_SESSION_KEY,
      serialize(windowQueue(data.queue, data.currentId))
    );
  } catch {
    try {
      store.setItem(
        PLAYER_SESSION_KEY,
        serialize(minQueue(data.queue, data.currentId))
      );
    } catch {
      clearPersistedSession();
    }
  }
}

/** Borra la sesión guardada (logout, blob inválido). */
export function clearPersistedSession(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PLAYER_SESSION_KEY);
  } catch {
    // Storage bloqueado: no hay nada que borrar sin romper el player.
  }
}
