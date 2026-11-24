"use client";

import * as React from "react";

import {
  clearPersistedSession,
  readPersistedSession,
  writePersistedSession,
} from "@/lib/player/persisted-session";
import { listensService } from "@/lib/services/listens-service";
import type { Song } from "@/lib/services/types";
import { claimAudio, releaseAudio, type AudioHandle } from "./audio-orchestrator";
// Runtime-safe: play-contexts importa de acá SOLO tipos (import type), no hay
// ciclo de módulos en ejecución.
import { radioContext } from "./play-contexts";

/**
 * Descriptor PEREZOSO de cola: la superficie describe CÓMO seguir trayendo
 * canciones del MISMO contexto (orden estable) en vez de materializar el array
 * completo en el cliente.
 *
 * - `seed` es la página que la superficie ya renderizó: el motor arranca con
 *   ella y NO la vuelve a pedir. Sin seed, el motor materializa la primera
 *   página ANTES de arrancar (1 fetch) y se posiciona en la canción pedida.
 * - Sin `loadPage` el contexto es FINITO (charts, álbumes ya cargados): nunca
 *   se fetchea nada.
 */
export interface PlayContext {
  /** Label para la UI de cola (Q3) y debug: "Playlist: X", "Populares de Y"… */
  label: string;
  /**
   * Identidad OPAQUE del contexto (p. ej. `playlist:${id}`): sirve para saber
   * si el reproductor ya está en ESTE contexto aunque dos superficies tengan el
   * mismo `label` (dos playlists homónimas).
   */
  key?: string;
  /** Página siguiente del contexto (orden estable por contexto). */
  loadPage?: (offset: number, limit: number) => Promise<Song[]>;
  /** Total conocido: hace exacto `hasNext` sin esperar a un fetch corto. */
  total?: number;
  /** Página inicial ya cargada por la superficie (offset 0). */
  seed?: Song[];
}

/** Cola materializada (comportamiento histórico) o descriptor perezoso. */
export type PlaySource = readonly Song[] | PlayContext;

/**
 * `Array.isArray` no estrecha bien las uniones con `readonly T[]`; este guard
 * deja el `else` como `readonly Song[] | undefined`.
 */
function isPlayContext(source: PlaySource | undefined): source is PlayContext {
  return source !== undefined && !Array.isArray(source);
}

interface PlayerState {
  current: Song | null;
  queue: Song[];
  /** Label del contexto activo (Q3); `null` si la cola fue un array suelto. */
  contextLabel: string | null;
  /** Key opaca del contexto activo (identidad entre superficies). */
  contextKey: string | null;
  playing: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  /** Hay un fetch de página/radio en vuelo (para el estado de la Cola). */
  isExtending: boolean;
  /** El último prefetch/encadenado falló por RED (reintentable desde la Cola). */
  prefetchFailed: boolean;
  /** Canciones que ya empezaron a sonar en esta reproducción (historial). */
  playedIds: ReadonlySet<string>;
  progress: number;
  duration: number;
  play: (song: Song, source?: PlaySource) => void;
  /** Salta a una canción YA materializada en la cola (click en la Cola del
   *  fullscreen). Conserva contexto/offset/radio encadenada. */
  jumpTo: (songId: string) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
}

const PlayerContext = React.createContext<PlayerState | null>(null);

/** Canciones por página del contexto (= tope de `limit` de la API). */
const CONTEXT_PAGE_SIZE = 50;

/**
 * Cada cuánto se persiste mientras suena (persist periódico en `timeupdate`):
 * el blob no debe quedar congelado con la duración/progreso previos a la
 * metadata, pero tampoco se escribe 4×/s.
 */
const PERSIST_INTERVAL_MS = 5_000;

/**
 * Colchón mínimo por delante de la canción actual: en la penúltima/última se
 * prefetchea sola la página siguiente (o se encadena la radio). Una página
 * trae 50 → el tamaño de página hace de histéresis y no hay loops.
 */
const PREFETCH_AHEAD = 2;

/**
 * Marca en memoria de "ya sabemos que hay sesión": evita repetir 401 de
 * `POST /me/listens` por cada play de un usuario anónimo.
 *
 * NO se puede leer la cookie `session` desde JS (es HttpOnly — ver
 * `apps/api/app/features/auth/backend.py`), así que la detección no puede
 * basarse en `document.cookie`.
 */
let knownAuthenticated: boolean | null = null;

/**
 * Reproductor persistente: un único <audio> global en el root layout,
 * sobrevive a la navegación. `play(song, source)` lo carga desde cualquier
 * página; `source` puede ser un array (cola fija) o un `PlayContext` que se
 * resuelve por páginas a medida que el usuario avanza.
 * Integra Media Session API (controles de pantalla de bloqueo) y registra cada
 * play (`POST /me/listens`) cuando una canción empieza a sonar.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const handleRef = React.useRef<AudioHandle | null>(null);
  const [current, setCurrent] = React.useState<Song | null>(null);
  const [queue, setQueue] = React.useState<Song[]>([]);
  const [contextLabel, setContextLabel] = React.useState<string | null>(null);
  const [contextKey, setContextKey] = React.useState<string | null>(null);
  const [contextHasMore, setContextHasMore] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  /** Fetch de página/radio en vuelo (UI de la Cola). */
  const [extending, setExtending] = React.useState(false);
  /** El prefetch no pudo traer más por RED (reintentable). */
  const [prefetchFailed, setPrefetchFailed] = React.useState(false);
  const prefetchFailedRef = React.useRef(false);
  /** Cancelación/identidad de la corrida de prefetch en vuelo (1 a la vez). */
  const prefetchRef = React.useRef<Promise<void> | null>(null);
  /** Historial de lo realmente iniciado (no todo lo materializado). */
  const [playedIds, setPlayedIds] = React.useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const playedRef = React.useRef<Set<string>>(new Set<string>());
  /**
   * `advance` en vuelo (fetch del borde). El prefetch NO debe encadenar la
   * radio mientras un avance espera la misma página: le cambiaría el contexto
   * y el avance se descartaría (el usuario pulsa next y no pasa nada).
   */
  const advancingRef = React.useRef(0);

  // Espejos en refs: los handlers async (fetch de la página siguiente) leen el
  // estado VIGENTE y no el del render que creó el closure.
  const currentRef = React.useRef<Song | null>(null);
  const queueRef = React.useRef<Song[]>([]);
  const contextRef = React.useRef<PlayContext | null>(null);
  /** Items del contexto ya consumidos (offset de la próxima página). */
  const offsetRef = React.useRef(0);
  const exhaustedRef = React.useRef(true);
  /**
   * Fetch de contexto en vuelo. Se guarda junto a su contexto: dos `next()`
   * sobre el MISMO contexto comparten la promesa; un contexto nuevo no hereda
   * la página de otro.
   */
  const inflightRef = React.useRef<{
    context: PlayContext;
    promise: Promise<Song[]>;
  } | null>(null);
  /**
   * Última cadena de radio fue estéril (catálogo chico): no se reintenta en
   * loop — hasta que el usuario reproduzca otra cosa (`play()` lo resetea).
   * Doble via (estado + ref) porque `hasNext` se lee en render y el flag se
   * escribe en un flujo async.
   */
  const [chainFailed, setChainFailed] = React.useState(false);
  const chainFailedRef = React.useRef(false);
  /**
   * Contexto cuyo último `extendContext` falló por RED (no por agotarse):
   * el encadenado lo consulta para NO latchear `chainFailed` ante un error
   * transitorio — el próximo `next()` reintenta.
   */
  const extendFailedRef = React.useRef<PlayContext | null>(null);
  /** Segundo a restaurar tras un F5: se aplica al primer play/`loadedmetadata`. */
  const pendingSeekRef = React.useRef<number | null>(null);
  /** `true` una vez aplicada la sesión guardada (StrictMode re-monta el efecto). */
  const restoredRef = React.useRef(false);
  /**
   * Espejos para persistir desde listeners con closures viejas (`pagehide` se
   * registra una vez): el label, la duración y el segundo vigentes viven acá.
   */
  const contextLabelRef = React.useRef<string | null>(null);
  const durationRef = React.useRef(0);
  const progressRef = React.useRef(0);
  /** Última duración finita > 0 vista: nunca se pisa con 0 (metadata tarda). */
  const knownDurationRef = React.useRef(0);
  /** Throttle del persist periódico durante `timeupdate`. */
  const lastPersistRef = React.useRef(0);

  const recordPlay = React.useCallback((song: Song) => {
    // Fire-and-forget: el backend deduplica plays consecutivos. Si no hay
    // sesión el POST devuelve 401 y lo ignoramos (una vez, con memoria).
    if (knownAuthenticated === false) return;
    listensService
      .recordPlay(song.id)
      .then(() => {
        knownAuthenticated = true;
      })
      .catch(() => {
        knownAuthenticated = false;
      });
  }, []);

  React.useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    // Handle estable del reproductor global para el orquestador de audio.
    handleRef.current = {
      pause: () => {
        audio.pause();
      },
    };
    return () => {
      audio.pause();
      if (handleRef.current) releaseAudio(handleRef.current);
      audioRef.current = null;
      handleRef.current = null;
    };
  }, []);

  /**
   * Restauración tras un F5 desde `sessionStorage`.
   *
   * NO rehidrata el `PlayContext` (tiene closures y el cursor interno de la
   * radio es privado): la cola vuelve como ARRAY FIJO (`contextRef = null`,
   * `exhausted = true`). Cuando se agota, el encadenado de Q4 crea la radio
   * desde la última canción ⇒ la cola nunca muere.
   *
   * Queda PAUSADO en el segundo guardado: setea `current` directo (sin
   * `startSong`, así no hay `audio.play()` ni `claimAudio`) y NO registra un
   * listen nuevo — el `POST /me/listens` sale solo del evento `play` del audio.
   */
  React.useEffect(() => {
    // Guard por ref: una restauración por montaje (StrictMode re-ejecuta el
    // efecto) y el setState queda ref-controlled para la regla del compiler.
    if (restoredRef.current) return;
    restoredRef.current = true;

    const blob = readPersistedSession();
    if (!blob) return;
    const song = blob.queue.find((item) => item.id === blob.currentId);
    if (!song) {
      clearPersistedSession();
      return;
    }

    setQueueState(blob.queue);
    setCurrentState(song);
    playedRef.current = new Set(blob.playedIds);
    setPlayedIds(playedRef.current);
    markPlayed(song.id);
    setContextLabel(blob.contextLabel);
    setContextKey(null);
    contextRef.current = null;
    exhaustedRef.current = true;
    syncContextHasMore();
    setProgress(blob.progress);
    setDuration(blob.duration || 0);
    setPlaying(false);
    pendingSeekRef.current = blob.progress;
    // Espejos inmediatos: el persist que corre más abajo en este mismo commit
    // no debe pisar el blob bueno con los valores iniciales (0).
    progressRef.current = blob.progress;
    durationRef.current = blob.duration || 0;
    knownDurationRef.current = blob.duration || 0;
    contextLabelRef.current = blob.contextLabel;
    // `preload="none"`: asignar `src` no descarga ni emite `play`.
    const audio = audioRef.current;
    if (audio) audio.src = song.stream_url ?? "";

    return () => {
      // StrictMode: el cleanup permite re-aplicar la sesión en el re-montaje
      // (el <audio> también se recrea y necesita su `src`).
      restoredRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espejos para persistir con closures viejas (ver refs). Van antes del efecto
  // de persistencia para que en el mismo commit ya estén actualizados.
  React.useEffect(() => {
    contextLabelRef.current = contextLabel;
  }, [contextLabel]);

  React.useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  React.useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  /**
   * Guarda la sesión desde refs (nunca desde la closure del render). `overrides`
   * lo usa el flush de salida para pasar progreso/duración leídos del <audio>.
   */
  const persistSession = React.useCallback(
    (overrides?: { progress?: number; duration?: number }) => {
      const songNow = currentRef.current;
      const queueNow = queueRef.current;
      if (!songNow || queueNow.length === 0) return;

      const audio = audioRef.current;
      const pending = pendingSeekRef.current;
      const live = audio?.currentTime ?? 0;

      // La duración vive en la metadata del <audio>; el espejo del estado puede
      // quedar viejo. Se recuerda la última finita > 0 para no escribir 0.
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        knownDurationRef.current = audio.duration;
      }
      const seenDuration =
        overrides?.duration ??
        (durationRef.current > 0
          ? durationRef.current
          : knownDurationRef.current);
      if (seenDuration > 0) knownDurationRef.current = seenDuration;

      writePersistedSession({
        currentId: songNow.id,
        queue: queueNow,
        // Orden de verdad: el segundo restaurado sin aplicar manda (la UI lo
        // muestra); si no, el `currentTime` vivo; y si el audio no tiene
        // metadata, el espejo de la UI.
        progress:
          overrides?.progress ??
          (pending !== null ? pending : live > 0 ? live : progressRef.current),
        duration: seenDuration > 0 ? seenDuration : knownDurationRef.current,
        contextLabel: contextLabelRef.current,
        playedIds: [...playedRef.current],
      });
      lastPersistRef.current = Date.now();
    },
    []
  );

  // Barato (~50 KB): canción/cola/play-pause.
  React.useEffect(() => {
    persistSession();
  }, [current, queue.length, playing, persistSession]);

  // Y al salir de la página (F5/navegación): lee del <audio> para no depender
  // de los espejos (la duración vive en la metadata, no en el estado).
  React.useEffect(() => {
    const flush = () => {
      const audio = audioRef.current;
      const liveDuration =
        audio && Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationRef.current > 0
            ? durationRef.current
            : knownDurationRef.current;
      const liveProgress =
        audio && audio.currentTime > 0
          ? audio.currentTime
          : pendingSeekRef.current ?? progressRef.current;
      persistSession({ progress: liveProgress, duration: liveDuration });
    };
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistSession]);

  function setQueueState(items: Song[]) {
    queueRef.current = items;
    setQueue(items);
  }

  function setCurrentState(song: Song | null) {
    currentRef.current = song;
    setCurrent(song);
  }

  /** El contexto todavía puede entregar páginas (lee refs, siempre fresco). */
  function canLoadMore() {
    const context = contextRef.current;
    return (
      Boolean(context?.loadPage) &&
      !exhaustedRef.current &&
      (context?.total === undefined || offsetRef.current < context.total)
    );
  }

  /** Recalcula si el contexto todavía puede entregar páginas. */
  function syncContextHasMore() {
    setContextHasMore(canLoadMore());
  }

  /** Cuántas canciones materializadas quedan DESPUÉS de la actual. */
  function aheadCount() {
    const song = currentRef.current;
    if (!song) return 0;
    const index = queueRef.current.findIndex((item) => item.id === song.id);
    return index >= 0 ? queueRef.current.length - 1 - index : 0;
  }

  function markPlayed(songId: string) {
    if (playedRef.current.has(songId)) return;
    const next = new Set(playedRef.current);
    next.add(songId);
    playedRef.current = next;
    setPlayedIds(next);
  }

  function startSong(song: Song) {
    // El segundo restaurado era de la canción anterior: cualquier arranque
    // (play/next/prev/jump) lo invalida.
    pendingSeekRef.current = null;
    setCurrentState(song);
    markPlayed(song.id);
    // El label/key se publican al ARRANCAR una canción, no al establecer el
    // contexto: el prefetch puede crear la radio con margen mientras todavía
    // suena la última pista y la UI de "Reproducir playlist" no debe cambiar
    // de identidad hasta que realmente empiece a sonar otra canción.
    setContextLabel(contextRef.current?.label ?? null);
    setContextKey(contextRef.current?.key ?? null);

    const audio = audioRef.current;
    if (!audio) return;
    // Toma el turno: pausa cualquier preview/audio activo.
    if (handleRef.current) claimAudio(handleRef.current);
    audio.src = song.stream_url ?? "";
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  /**
   * Trae la página siguiente del contexto y la appendea (dedupe por id).
   *
   * - Un solo fetch por contexto en vuelo: los avances concurrentes comparten
   *   la misma promesa.
   * - Si mientras viajaba la página otra superficie llamó `play()` (el contexto
   *   cambió), la respuesta se DESCARTA: no se mezclan canciones ni se pisan
   *   `offset`/`exhausted` del contexto nuevo.
   */
  async function extendContext(): Promise<Song[]> {
    const context = contextRef.current;
    if (!context?.loadPage) return [];
    if (inflightRef.current?.context === context) {
      return inflightRef.current.promise;
    }
    if (exhaustedRef.current) return [];
    if (context.total !== undefined && offsetRef.current >= context.total) {
      exhaustedRef.current = true;
      syncContextHasMore();
      return [];
    }

    const entry: { context: PlayContext; promise: Promise<Song[]> } = {
      context,
      promise: Promise.resolve([] as Song[]),
    };

    setExtending(true);
    const request = context
      .loadPage(offsetRef.current, CONTEXT_PAGE_SIZE)
      .then((page) => {
        // Contexto reemplazado durante el fetch: la página vieja no entra.
        if (contextRef.current !== context) return [] as Song[];
        extendFailedRef.current = null;
        if (prefetchFailedRef.current) {
          prefetchFailedRef.current = false;
          setPrefetchFailed(false);
        }

        offsetRef.current += page.length;
        if (page.length < CONTEXT_PAGE_SIZE) exhaustedRef.current = true;

        const known = new Set(queueRef.current.map((song) => song.id));
        const fresh = page.filter((song) => !known.has(song.id));
        // Página sin novedades (contextos que devuelven todo junto): agotado,
        // para no ciclar pidiendo lo mismo.
        if (fresh.length === 0) exhaustedRef.current = true;

        if (fresh.length > 0) {
          setQueueState([...queueRef.current, ...fresh]);
        }
        syncContextHasMore();
        return fresh;
      })
      .catch(() => {
        if (contextRef.current !== context) return [] as Song[];
        // Se recuerda el fallo: el encadenado no lo confunde con "agotado".
        extendFailedRef.current = context;
        exhaustedRef.current = true;
        syncContextHasMore();
        return [] as Song[];
      })
      .finally(() => {
        // Sólo limpia el dueño de la entrada (un contexto nuevo pudo reemplazarla).
        if (inflightRef.current === entry) inflightRef.current = null;
        setExtending(false);
      });

    entry.promise = request;
    inflightRef.current = entry;
    return request;
  }

  /**
   * Crea la radio encadenada de `last` y la deja como contexto activo. NO
   * publica `contextLabel`/`contextKey`: eso pasa recién cuando una canción de
   * la radio arranca (`startSong`), así el prefetch puede crear la radio con
   * margen sin cambiar la identidad del contexto mientras suena la última
   * canción de la lista.
   *
   * Devuelve `null` si el autoplay ya se declaró estéril (`chainFailed`).
   */
  function establishChain(last: Song): PlayContext | null {
    if (chainFailedRef.current) return null;

    // Late binding: las exclusiones son todo lo ya materializado, horneadas en
    // el contexto nuevo para que sus páginas devuelvan SOLO canciones nuevas.
    const radio = radioContext({
      seed: last,
      excludeIds: new Set(queueRef.current.map((song) => song.id)),
    });
    contextRef.current = radio;
    offsetRef.current = 0;
    exhaustedRef.current = false;
    // Nuevo contexto: no hereda el inflight del anterior.
    inflightRef.current = null;
    syncContextHasMore();
    return radio;
  }

  /**
   * Mantiene `minAhead` canciones materializadas por delante de la actual.
   * Se dispara solo (efecto), NUNCA mueve la canción ni pausa: appendea la
   * página siguiente o encadena la radio cuando el contexto se agotó. Así la
   * Cola deja de mostrar "no hay más" mientras todavía suena la última pista.
   */
  async function ensureAhead(minAhead = PREFETCH_AHEAD): Promise<void> {
    if (prefetchRef.current) return;
    if (aheadCount() >= minAhead) return;

    const song = currentRef.current;
    if (!song) return;
    // Si la canción actual todavía no está materializada, `play()` está
    // bootstrapeando el contexto (sin seed): el prefetch no debe robarle el
    // control ni encadenar la radio antes de que arranque la canción pedida.
    if (!queueRef.current.some((item) => item.id === song.id)) return;

    const run = (async () => {
      const contextAtStart = contextRef.current;

      // 1) Todavía quedan páginas del contexto actual.
      if (canLoadMore()) {
        await extendContext();
        // Otra superficie tomó el control durante el fetch.
        if (contextRef.current !== contextAtStart) return;
        if (aheadCount() >= minAhead) return;
      }

      // 2) Contexto agotado (o página estéril): encadenar la radio. Se
      //    establece de forma SINCRÓNICA antes del primer await del fetch.
      //    Un `advance` en vuelo manda: ya va a encadenar él (o a avanzar con
      //    la página que ambos esperan) y no se le puede cambiar el contexto.
      if (advancingRef.current > 0) return;
      const last = currentRef.current;
      if (!last) return;
      // Longitud ANTES de encadenar: si el pull vuelve vacío sin error, no hay
      // material nuevo ⇒ esterilidad real (mismo criterio que `advance`).
      const before = queueRef.current.length;
      const radio = establishChain(last);
      if (!radio) return;

      await extendContext();
      if (contextRef.current !== radio) return;

      if (extendFailedRef.current === radio) {
        // Fallo de RED (no esterilidad): se reporta para el "Reintentar" de la
        // Cola y NO se latchea `chainFailed` — el próximo `next()` reintenta.
        prefetchFailedRef.current = true;
        setPrefetchFailed(true);
      } else if (queueRef.current.length === before) {
        // Pull exitoso pero sin canciones nuevas: si no se latchea acá, el
        // efecto no se re-dispara (deps `[current, queue.length, chainFailed]`)
        // y la Cola quedaría en skeleton eterno hasta el `onEnded`.
        chainFailedRef.current = true;
        setChainFailed(true);
        exhaustedRef.current = true;
        syncContextHasMore();
      }
      extendFailedRef.current = null;
    })();

    prefetchRef.current = run;
    try {
      await run;
    } finally {
      // Sólo libera la marca el dueño (un `play()` pudo arrancar otra corrida).
      if (prefetchRef.current === run) prefetchRef.current = null;
    }
  }

  /**
   * Avanza/retrocede una canción. Si el índice toca el final de lo
   * materializado y hay contexto, extiende antes de avanzar.
   * Devuelve si realmente se movió (lo usa `onEnded` para decidir el stop).
   */
  async function advance(direction: 1 | -1): Promise<boolean> {
    const from = currentRef.current;
    if (!from) return false;

    const items = queueRef.current;
    const index = items.findIndex((song) => song.id === from.id);
    if (index === -1) return false;

    if (direction === -1) {
      const previous = index > 0 ? items[index - 1] : undefined;
      if (!previous) return false;
      startSong(previous);
      return true;
    }

    const materializedNext = items[index + 1];
    if (materializedNext) {
      startSong(materializedNext);
      return true;
    }

    advancingRef.current += 1;
    try {
      // Final de lo materializado: puede haber más en el contexto.
      const contextAtStart = contextRef.current;
      await extendContext();

      // Otra superficie llamó `play()` mientras la página viajaba: el control es
      // suyo, así que este avance no toca la cola nueva.
      if (contextRef.current !== contextAtStart) return false;

      // Se relee el estado: otro `advance` concurrente pudo haber avanzado ya.
      const grown = queueRef.current;
      const currentNow = currentRef.current;
      const indexNow = currentNow
        ? grown.findIndex((song) => song.id === currentNow.id)
        : -1;
      const nextSong = indexNow >= 0 ? grown[indexNow + 1] : undefined;
      if (nextSong) {
        startSong(nextSong);
        return true;
      }

      // Final REAL del contexto: encadenar la radio de la última canción (Q4 —
      // autoplay, como Spotify). Late binding: las exclusiones son todo lo ya
      // reproducido, horneadas en el contexto nuevo para que sus páginas
      // devuelvan SOLO canciones nuevas (el dedupe del motor no la marcaría
      // agotada por ver ids conocidos).
      const last = currentRef.current;
      if (!last) return false;
      const radio = establishChain(last);
      if (!radio) return false;

      await extendContext();
      // Raza estándar: otra superficie pudo tomar el control durante el fetch.
      if (contextRef.current !== radio) return false;

      const chained = queueRef.current;
      const chainedIndex = chained.findIndex((song) => song.id === last.id);
      const chainedNext =
        chainedIndex >= 0 ? chained[chainedIndex + 1] : undefined;
      if (!chainedNext) {
        // Cadena estéril (artista/género sin nada nuevo): se detiene de verdad.
        // Un fallo de RED en el pull NO se latchea (es reintentable): sólo la
        // esterilidad real bloquea el autoplay hasta el próximo `play()`.
        const failedByNetwork = extendFailedRef.current === radio;
        extendFailedRef.current = null;
        if (failedByNetwork) {
          // Mismo aviso que el prefetch: la Cola ofrece "Reintentar".
          prefetchFailedRef.current = true;
          setPrefetchFailed(true);
        } else {
          chainFailedRef.current = true;
          setChainFailed(true);
        }
        exhaustedRef.current = true;
        syncContextHasMore();
        return false;
      }
      // El usuario se movió DURANTE el fetch (prev o click en la Cola): su
      // acción manda — no se pisa con el salto del chain (y devolver true evita
      // que el onEnded corte lo que acaba de poner).
      if (currentRef.current?.id !== last.id) return true;
      startSong(chainedNext);
      return true;
    } finally {
      advancingRef.current -= 1;
    }
  }

  function play(song: Song, source?: PlaySource) {
    // Nueva reproducción: la cadena de radio vuelve a estar disponible y el
    // historial arranca de cero (lo que ya sonó no es de esta reproducción).
    chainFailedRef.current = false;
    setChainFailed(false);
    extendFailedRef.current = null;
    prefetchFailedRef.current = false;
    setPrefetchFailed(false);
    // Un prefetch viejo sigue vivo hasta su próximo await, pero su identidad
    // de contexto lo descarta; liberamos la marca para arrancar el nuevo ya.
    prefetchRef.current = null;
    playedRef.current = new Set();
    setPlayedIds(playedRef.current);

    if (isPlayContext(source)) {
      const context = source;
      contextRef.current = context;
      setContextLabel(context.label);
      setContextKey(context.key ?? null);
      exhaustedRef.current = !context.loadPage;

      const seed = context.seed ?? [];
      if (seed.length > 0) {
        offsetRef.current = seed.length;
        setQueueState(seed);
        syncContextHasMore();
        startSong(song);
        return;
      }

      // Contexto sin seed (p. ej. un álbum resuelto por `getAlbumById`):
      // materializa páginas hasta encontrar la canción pedida —puede caer en la
      // página 2+— y recién ahí arranca.
      offsetRef.current = 0;
      setQueueState([]);
      syncContextHasMore();
      const contextAtStart = context;
      void (async () => {
        await extendContext();
        let items = queueRef.current;
        let target = items.find((candidate) => candidate.id === song.id);
        while (!target && !exhaustedRef.current) {
          if (contextRef.current !== contextAtStart) return;
          await extendContext();
          items = queueRef.current;
          target = items.find((candidate) => candidate.id === song.id);
        }

        // Otra superficie tomó el control: no se pisa su play.
        if (contextRef.current !== contextAtStart) return;

        if (items.length === 0) setQueueState([song]);
        startSong(target ?? items[0] ?? song);
      })();
      return;
    }

    // Array (o sin source): la cola ES ese slice, comportamiento histórico.
    contextRef.current = null;
    setContextLabel(null);
    setContextKey(null);
    exhaustedRef.current = true;
    setContextHasMore(false);
    setQueueState(source ? [...source] : queueRef.current);
    startSong(song);
  }

  /**
   * Salta a una canción YA materializada en la cola (click en la Cola del
   * fullscreen). NO toca el contexto: se conserva `contextLabel`, el
   * offset/exhausted y la radio encadenada, así "Siguiente de: X" sigue siendo
   * el mismo. El play se registra por el listener `play` del <audio>, igual que
   * en `next`/`prev`.
   */
  function jumpTo(songId: string) {
    const target = queueRef.current.find((song) => song.id === songId);
    if (!target) return;
    startSong(target);
  }

  function pause() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (handleRef.current) releaseAudio(handleRef.current);
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      // Restaurado pausado: aplica el segundo guardado antes de sonar (si el
      // `loadedmetadata` todavía no llegó a hacerlo).
      const pending = pendingSeekRef.current;
      if (pending !== null) {
        audio.currentTime = pending;
        // Antes de `loadedmetadata` el navegador puede ignorar el seek: sólo
        // consumimos el pendiente si el audio quedó realmente en ese segundo
        // (si no, el `onLoaded` que dispara `play()` lo reintenta).
        if (Math.abs(audio.currentTime - pending) <= 1) {
          setProgress(audio.currentTime);
          pendingSeekRef.current = null;
        }
      }
      if (handleRef.current) claimAudio(handleRef.current);
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      pause();
    }
  }

  function next() {
    void advance(1);
  }

  function prev() {
    void advance(-1);
  }

  function seek(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    // El scrub del usuario gana sobre el segundo restaurado.
    pendingSeekRef.current = null;
    audio.currentTime = time;
    setProgress(time);
  }

  const currentIndex = current
    ? queue.findIndex((song) => song.id === current.id)
    : -1;
  // Como Spotify: mientras suene algo SIEMPRE hay siguiente posible (el motor
  // encadena la radio al agotar el contexto) — salvo que la última cadena haya
  // resultado estéril.
  const hasNext =
    currentIndex >= 0 &&
    (currentIndex < queue.length - 1 || contextHasMore || !chainFailed);
  const hasPrev = currentIndex > 0;

  // Media Session API: metadata + controles del sistema operativo. next/prev se
  // registran SOLO si hay destino (sin handler, el SO deshabilita el botón).
  React.useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist.name,
      album: "Pulse Stream",
      artwork: current.cover_url
        ? [{ src: current.cover_url, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler(
      "previoustrack",
      hasPrev ? () => void advance(-1) : null,
    );
    navigator.mediaSession.setActionHandler(
      "nexttrack",
      hasNext ? () => void advance(1) : null,
    );
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, hasNext, hasPrev]);

  // Prefetch anticipado: con `PREFETCH_AHEAD` canciones de margen la cola se
  // llena sola (y al agotarse encadena la radio) sin que el usuario pulse next.
  // Depende de `queue.length` (no de `queue`) para no re-disparar por identidad.
  React.useEffect(() => {
    if (!current) return;
    void ensureAhead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, queue.length, chainFailed]);

  // Sincroniza estado con el <audio> (fin de canción, progreso, duración,
  // y registro de cada play cuando realmente empieza a sonar).
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      // Al final de lo materializado extiende el contexto; si se agota,
      // encadena la radio de la última canción (Q4). Si la cadena es estéril,
      // ahí sí se detiene.
      void advance(1).then((moved) => {
        if (moved) return;
        setPlaying(false);
        if (handleRef.current) releaseAudio(handleRef.current);
      });
    };
    const onPause = () => {
      setPlaying(false);
      if (handleRef.current) releaseAudio(handleRef.current);
    };
    const onPlay = () => {
      setPlaying(true);
      if (current) recordPlay(current);
    };
    const onTime = () => {
      // Con un segundo restaurado sin aplicar, `audio.currentTime` es 0 y
      // pisaría la UI (y el persist): esperar a que el seek tome.
      if (pendingSeekRef.current !== null) return;
      setProgress(audio.currentTime);
      // Persist acotado: mientras suena, el blob no debe quedar congelado con
      // la duración/progreso de antes de la metadata (ni escribir 4×/s).
      if (Date.now() - lastPersistRef.current >= PERSIST_INTERVAL_MS) {
        persistSession();
      }
    };
    const onLoaded = () => {
      // Nunca pisar la duración restaurada con 0/NaN (metadata a medias).
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        knownDurationRef.current = audio.duration;
      }
      const pending = pendingSeekRef.current;
      if (pending !== null) {
        audio.currentTime = pending;
        if (Math.abs(audio.currentTime - pending) <= 1) {
          setProgress(audio.currentTime);
          pendingSeekRef.current = null;
        }
        // Si no tomó, queda pendiente para el próximo `onLoaded`/`toggle`.
        return;
      }
      setProgress(audio.currentTime);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, queue]);

  const value = React.useMemo<PlayerState>(
    () => ({
      current,
      queue,
      contextLabel,
      contextKey,
      playing,
      hasPrev,
      hasNext,
      isExtending: extending,
      prefetchFailed,
      playedIds,
      progress,
      duration,
      play,
      jumpTo,
      toggle,
      pause,
      next,
      prev,
      seek,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      current,
      queue,
      contextLabel,
      contextKey,
      playing,
      progress,
      duration,
      currentIndex,
      contextHasMore,
      chainFailed,
      extending,
      prefetchFailed,
      playedIds,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = React.useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer debe usarse dentro de <PlayerProvider>");
  return ctx;
}
