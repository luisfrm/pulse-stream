"use client";

import * as React from "react";

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

  function setQueueState(items: Song[]) {
    queueRef.current = items;
    setQueue(items);
  }

  function setCurrentState(song: Song | null) {
    currentRef.current = song;
    setCurrent(song);
  }

  /** Recalcula si el contexto todavía puede entregar páginas. */
  function syncContextHasMore() {
    const context = contextRef.current;
    const canLoad =
      Boolean(context?.loadPage) &&
      !exhaustedRef.current &&
      (context?.total === undefined || offsetRef.current < context.total);
    setContextHasMore(canLoad);
  }

  function startSong(song: Song) {
    setCurrentState(song);

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

    const request = context
      .loadPage(offsetRef.current, CONTEXT_PAGE_SIZE)
      .then((page) => {
        // Contexto reemplazado durante el fetch: la página vieja no entra.
        if (contextRef.current !== context) return [] as Song[];

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
        exhaustedRef.current = true;
        syncContextHasMore();
        return [] as Song[];
      })
      .finally(() => {
        // Sólo limpia el dueño de la entrada (un contexto nuevo pudo reemplazarla).
        if (inflightRef.current === entry) inflightRef.current = null;
      });

    entry.promise = request;
    inflightRef.current = entry;
    return request;
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
    if (chainFailedRef.current) return false;
    const last = currentRef.current;
    if (!last) return false;

    const radio = radioContext({
      seed: last,
      excludeIds: new Set(queueRef.current.map((song) => song.id)),
    });
    contextRef.current = radio;
    setContextLabel(radio.label);
    setContextKey(radio.key ?? null);
    offsetRef.current = 0;
    exhaustedRef.current = false;
    // Nuevo contexto: no hereda el inflight del anterior.
    inflightRef.current = null;
    syncContextHasMore();

    await extendContext();
    // Raza estándar: otra superficie pudo tomar el control durante el fetch.
    if (contextRef.current !== radio) return false;

    const chained = queueRef.current;
    const chainedIndex = chained.findIndex((song) => song.id === last.id);
    const chainedNext =
      chainedIndex >= 0 ? chained[chainedIndex + 1] : undefined;
    if (!chainedNext) {
      // Cadena estéril (artista/género sin nada nuevo): se detiene de verdad
      // y no se reintenta hasta el próximo `play()`.
      chainFailedRef.current = true;
      setChainFailed(true);
      exhaustedRef.current = true;
      syncContextHasMore();
      return false;
    }
    startSong(chainedNext);
    return true;
  }

  function play(song: Song, source?: PlaySource) {
    // Nueva reproducción: la cadena de radio vuelve a estar disponible.
    chainFailedRef.current = false;
    setChainFailed(false);

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
    const onTime = () => setProgress(audio.currentTime);
    const onLoaded = () => {
      setDuration(audio.duration || 0);
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
