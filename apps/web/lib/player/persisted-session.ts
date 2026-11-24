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
  /**
   * Cola materializada: solo la canción ACTUAL conserva su letra (la tab Letra
   * la necesita tras el F5 y el contexto no se rehidrata); el resto va sin
   * letra para no inflar el blob.
   */
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

function isSongLike(value: unknown): value is Song {
  if (typeof value !== "object" || value === null) return false;
  const song = value as Partial<Song>;
  return (
    typeof song.id === "string" &&
    song.id.length > 0 &&
    typeof song.title === "string" &&
    typeof song.artist === "object" &&
    song.artist !== null &&
    typeof (song.artist as { id?: unknown }).id === "string"
  );
}

/**
 * Valida y normaliza el blob. Rechaza números rotos, items de cola sin
 * `id`/`title`/`artist.id` (los filtra) y un `currentId` repetido (el `find`
 * tomaría el primero y la copia se vería duplicada en "A continuación").
 */
function normalizePersistedSession(value: unknown): PersistedSession | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Partial<PersistedSession>;

  if (data.v !== VERSION) return null;
  if (typeof data.progress !== "number" || !Number.isFinite(data.progress)) {
    return null;
  }
  if (data.progress < 0) return null;
  if (typeof data.duration !== "number" || !Number.isFinite(data.duration)) {
    return null;
  }
  if (data.duration < 0) return null;
  if (typeof data.currentId !== "string" || data.currentId.length === 0) {
    return null;
  }
  if (!(data.contextLabel === null || typeof data.contextLabel === "string")) {
    return null;
  }
  if (!Array.isArray(data.playedIds) || !Array.isArray(data.queue)) return null;

  const queue = data.queue.filter(isSongLike);
  if (queue.length === 0) return null;
  if (!queue.some((song) => song.id === data.currentId)) return null;
  if (queue.filter((song) => song.id === data.currentId).length > 1) return null;

  return {
    v: VERSION,
    savedAt: typeof data.savedAt === "number" ? data.savedAt : 0,
    currentId: data.currentId,
    queue,
    progress: data.progress,
    duration: data.duration,
    contextLabel: data.contextLabel,
    playedIds: data.playedIds.filter(
      (id): id is string => typeof id === "string"
    ),
  };
}

/**
 * Lee la sesión guardada. Cualquier cosa inválida (JSON roto, versión vieja,
 * `currentId` fuera/repetido, números rotos) borra la entrada y devuelve `null`:
 * el player arranca limpio en vez de con un estado a medias.
 */
export function readPersistedSession(): PersistedSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PLAYER_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const session = normalizePersistedSession(parsed);
    if (!session) {
      clearPersistedSession();
      return null;
    }
    return session;
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
 * Persiste la sesión. Serializa la cola **sin letras salvo la canción actual**
 * (la tab Letra la necesita tras el F5; son unos KB) y la recorta si supera
 * `MAX_QUEUE`. Nunca rompe el player: ante `QuotaExceededError` reintenta con la
 * cola mínima y, si tampoco entra, limpia la entrada y sigue.
 */
export function writePersistedSession(data: SessionSnapshot): void {
  const store = storage();
  if (!store) return;

  const serialize = (queue: Song[]) =>
    JSON.stringify({
      v: VERSION,
      savedAt: Date.now(),
      ...data,
      queue: queue.map((song) =>
        song.id === data.currentId ? song : { ...song, lyrics: null }
      ),
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
