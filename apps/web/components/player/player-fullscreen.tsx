"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { OfflineButton } from "@/components/offline-button";
import { NoCover } from "@/components/no-cover";
import { Button, Skeleton, Slider, cn } from "@/components/ui";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import type { Song } from "@/lib/services/types";
import { formatGenre, formatTime } from "@/lib/utils/format";
import { usePlayer } from "./player-provider";

interface PlayerFullscreenProps {
  onClose: () => void;
}

type PlayerTab = "now" | "lyrics" | "queue";

const PLAYER_TABS = ["now", "lyrics", "queue"] as const;

const TAB_LABELS: Record<PlayerTab, string> = {
  now: "Ahora suena",
  lyrics: "Letra",
  queue: "Cola",
};

/**
 * Reproductor en pantalla completa: fondo con el cover desenfocado, cover
 * grande, progreso, controles y las tabs "Ahora suena" / "Letra" / "Cola".
 * En desktop el cover+controles quedan fijos a la izquierda y las tabs son
 * "Letra | Cola" (el panel derecho abre en la letra); en mobile se ven las tres
 * y el default es "Ahora suena".
 *
 * Los tabs quedan FIJOS (solo scrollea el panel activo, cada uno con su propia
 * memoria de scroll) y los tres paneles viven montados: cambiar de tab no
 * pierde la posición ni remonta la lista.
 */
export function PlayerFullscreen({ onClose }: PlayerFullscreenProps) {
  const {
    current,
    queue,
    contextLabel,
    playing,
    toggle,
    next,
    prev,
    hasPrev,
    hasNext,
    isExtending,
    prefetchFailed,
    playedIds,
    progress,
    duration,
    seek,
    jumpTo,
  } = usePlayer();
  const [tab, setTab] = React.useState<PlayerTab>("now");
  const isDesktop = useMediaQuery("(min-width: 640px)");
  // En desktop "Ahora suena" y "Letra" son la misma pantalla (cover+controles
  // fijos a la izquierda): el estado crudo `now` se normaliza a `lyrics` para
  // la tab activa, incluida la memoria de scroll. En mobile se usa tal cual.
  const activeTab: PlayerTab = isDesktop && tab === "now" ? "lyrics" : tab;
  // Tabs realmente ofrecidas (desktop solo Letra/Cola; mobile las tres).
  const visibleTabs: readonly PlayerTab[] = isDesktop
    ? ["lyrics", "queue"]
    : PLAYER_TABS;

  // Memoria de scroll POR PANEL: `display:none` resetea el scrollTop, así que
  // al volver a una tab restauramos lo último visto.
  const scrollMemory = React.useRef<Record<PlayerTab, number>>({
    now: 0,
    lyrics: 0,
    queue: 0,
  });
  const nowScrollRef = React.useRef<HTMLDivElement | null>(null);
  const lyricsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const queueScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Handlers memoizados que NO leen refs en render: usan `e.currentTarget`.
  // Un panel oculto (`display:none`) resetea su scrollTop y emite un scroll:
  // ignorarlo para no pisar la memoria con 0.
  const onNowScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (e.currentTarget.offsetParent === null) return;
      scrollMemory.current.now = e.currentTarget.scrollTop;
    },
    []
  );
  const onLyricsScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (e.currentTarget.offsetParent === null) return;
      scrollMemory.current.lyrics = e.currentTarget.scrollTop;
    },
    []
  );
  const onQueueScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (e.currentTarget.offsetParent === null) return;
      scrollMemory.current.queue = e.currentTarget.scrollTop;
    },
    []
  );

  // Restaura la posición del panel activo ANTES del paint.
  React.useLayoutEffect(() => {
    const element =
      activeTab === "now"
        ? nowScrollRef.current
        : activeTab === "lyrics"
          ? lyricsScrollRef.current
          : queueScrollRef.current;
    // `offsetParent` null ⇒ display:none: todavía no tiene caja de scroll.
    if (element && element.offsetParent !== null) {
      element.scrollTop = scrollMemory.current[activeTab];
    }
  }, [activeTab]);

  React.useEffect(() => {
    // Defensivo: si no hay canción no hay fullscreen visible; no bloqueamos el
    // scroll del body ni registramos el Escape en ese estado.
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [current, onClose]);

  // Memoizados: el fullscreen se re-renderiza ~4×/s por `progress` y la letra
  // hace split+map de todo el texto en cada render.
  const lyrics = current?.lyrics ?? null;
  const lyricsPanel = React.useMemo(
    () => <LyricsPanel lyrics={lyrics} />,
    [lyrics]
  );

  const queueActive = activeTab === "queue";
  const queuePanel = React.useMemo(
    () =>
      current ? (
        <QueuePanel
          queue={queue}
          current={current}
          contextLabel={contextLabel}
          playing={playing}
          playedIds={playedIds}
          hasNext={hasNext}
          isExtending={isExtending}
          prefetchFailed={prefetchFailed}
          active={queueActive}
          onJump={jumpTo}
          onRetry={next}
        />
      ) : null,
    // `jumpTo`/`next` leen los refs del provider: una closure vieja sigue
    // siendo válida. Incluirlas rompería el memo en cada tick de `progress`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      queue,
      current,
      contextLabel,
      playing,
      playedIds,
      hasNext,
      isExtending,
      prefetchFailed,
      queueActive,
    ]
  );

  if (!current) return null;

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    // `index` es la posición en `visibleTabs` (en desktop la tab oculta de
    // "Ahora suena" no se ofrece y no llega acá).
    if (index < 0) return;
    const count = visibleTabs.length;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % count;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = count - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const target = visibleTabs[nextIndex];
    setTab(target);
    // Roving tabindex: el foco sigue a la tab seleccionada.
    document.getElementById(`player-tab-${target}`)?.focus();
  }

  return (
    <div
      className="animate-fade-in fixed inset-x-0 top-0 z-[60] flex h-svh flex-col bg-bg-base"
      role="dialog"
      aria-modal="true"
      aria-label={`Reproductor: ${current.title} de ${current.artist.name}`}
    >
      {/* Fondo atmosférico: cover desenfocado + velo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {current.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.cover_url}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          />
        ) : (
          <div className="bg-blooms h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-bg-base/60 via-bg-base/80 to-bg-base" />
      </div>

      {/* Header: cerrar (fijo) */}
      <div className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar reproductor"
          className="rounded-full p-2.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <ChevronDown size={28} />
        </button>

        <span className="font-display text-sm font-semibold tracking-wide text-text-subdued">
          REPRODUCIENDO
        </span>

        <div className="w-11" />
      </div>

      {/* Contenido: tabs fijos arriba + paneles con scroll propio */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-4 px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
        {/* Tabs (todos los tamaños: en desktop son la única forma de abrir la
            Cola). No scrollean: el scroll vive en cada panel. */}
        <div className="relative flex shrink-0 items-center justify-center gap-1.5 pr-12 sm:pr-0">
          <div
            role="tablist"
            aria-label="Secciones del reproductor"
            className="flex items-center justify-center gap-1.5"
          >
            {PLAYER_TABS.map((value) => (
              <button
                key={value}
                type="button"
                id={`player-tab-${value}`}
                role="tab"
                aria-selected={activeTab === value}
                aria-controls={`player-panel-${value}`}
                tabIndex={activeTab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(event) =>
                  handleTabKeyDown(event, visibleTabs.indexOf(value))
                }
                className={cn(
                  "rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
                  // En desktop sobra: cover+controles ya están fijos a la izquierda.
                  value === "now" && "sm:hidden",
                  activeTab === value
                    ? "bg-bg-highlight text-text-primary"
                    : "text-text-subdued hover:text-text-primary"
                )}
              >
                {TAB_LABELS[value]}
              </button>
            ))}
          </div>

          {/* Descarga flotando a la derecha de las tabs (solo móvil: en desktop
              hay una con label debajo de los controles) */}
          <OfflineButton
            song={current}
            className="absolute right-0 top-1/2 -translate-y-1/2 sm:hidden"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col gap-6 sm:grid sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:items-stretch">
            {/* Panel 1: "Ahora suena" (cover + info + controles). En desktop
                queda siempre visible. */}
            <div
              id="player-panel-now"
              role="tabpanel"
              aria-labelledby="player-tab-now"
              ref={nowScrollRef}
              onScroll={onNowScroll}
              className={cn(
                "flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto overscroll-contain sm:justify-center",
                tab !== "now" && "hidden sm:flex"
              )}
            >
              <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border border-bg-highlight/60 shadow-2xl">
                {current.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={current.cover_url}
                    alt={`Cover de ${current.title}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <NoCover size="lg" />
                )}
              </div>

              <div className="w-full text-center">
                <h2 className="font-display truncate text-2xl font-bold leading-tight">
                  {current.title}
                </h2>
                <Link
                  href={`/artist/${current.artist.id}`}
                  onClick={onClose}
                  className="mt-1 block text-base text-brand-400 hover:underline"
                >
                  {current.artist.name}
                </Link>
                {(current.genres?.length ?? 0) > 0 && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {current.genres!.map((genre) => (
                      <span
                        key={genre}
                        className="rounded-pill border border-bg-highlight bg-bg-elevated/60 px-2.5 py-0.5 text-xs text-text-subdued"
                      >
                        {formatGenre(genre)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="w-full">
                <Slider
                  value={progress}
                  max={duration}
                  onSeek={seek}
                  ariaLabel="Progreso de reproducción"
                  ariaValueText={`${formatTime(progress)} de ${formatTime(duration)}`}
                />
                <div className="mt-1 flex justify-between text-xs tabular-nums text-text-subdued">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-7">
                <button
                  type="button"
                  onClick={prev}
                  disabled={!hasPrev}
                  aria-label="Anterior"
                  className="rounded-full p-3 text-text-primary transition-colors hover:bg-bg-highlight disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
                >
                  <SkipBack size={30} />
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={playing ? "Pausar" : "Reproducir"}
                  className="rounded-full bg-brand-400 p-6 text-bg-base shadow-lg shadow-brand-900/50 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                >
                  {playing ? <Pause size={32} /> : <Play size={32} className="translate-x-[2px]" />}
                </button>
                <button
                  type="button"
                  onClick={next}
                  disabled={!hasNext}
                  aria-label="Siguiente"
                  className="rounded-full p-3 text-text-primary transition-colors hover:bg-bg-highlight disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
                >
                  <SkipForward size={30} />
                </button>
              </div>

              <div className="hidden sm:flex">
                <OfflineButton song={current} withLabel />
              </div>
            </div>

            {/* Columna 2 (desktop) / panel de la tab (móvil): Letra y Cola. En
                desktop "Ahora suena" muestra la letra al costado, como antes. */}
            <div
              className={cn(
                "relative min-h-0 flex-1 sm:h-full",
                activeTab === "now" && "hidden sm:block"
              )}
            >
              <div
                id="player-panel-lyrics"
                role="tabpanel"
                aria-labelledby="player-tab-lyrics"
                ref={lyricsScrollRef}
                onScroll={onLyricsScroll}
                tabIndex={0}
                className={cn(
                  "h-full min-h-0 overflow-y-auto overscroll-contain focus-visible:outline-none",
                  activeTab === "queue"
                    ? "hidden"
                    : activeTab === "lyrics"
                      ? "block"
                      : "hidden sm:block"
                )}
              >
                {lyricsPanel}
              </div>

              <div
                id="player-panel-queue"
                role="tabpanel"
                aria-labelledby="player-tab-queue"
                ref={queueScrollRef}
                onScroll={onQueueScroll}
                className={cn(
                  "h-full min-h-0 overflow-y-auto overscroll-contain",
                  activeTab === "queue" ? "block" : "hidden"
                )}
              >
                {queuePanel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LyricsPanel({ lyrics }: { lyrics: string | null }) {
  const hasLyrics = Boolean(lyrics?.trim());

  return (
    <>
      <h3 className="mb-4 text-center font-display text-sm font-semibold uppercase tracking-[0.2em] text-text-subdued">
        Letra
      </h3>
      {hasLyrics ? (
        <div className="mx-auto max-w-xl space-y-6">
          {lyrics!
            .split(/\n{2,}/)
            .map((stanza, index) => (
              <div key={index} className="space-y-3">
                {stanza
                  .split("\n")
                  .filter(Boolean)
                  .map((line, lineIndex) => (
                    <p
                      key={lineIndex}
                      className="font-display text-2xl font-medium leading-relaxed text-text-primary/90"
                    >
                      {line}
                    </p>
                  ))}
              </div>
            ))}
        </div>
      ) : (
        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
          <p className="font-display text-lg text-text-subdued">
            Esta canción no tiene letra todavía.
          </p>
          <p className="text-sm text-text-subdued/70">
            Cuando el artista la suba, va a aparecer acá.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Tab "Cola" (patrón Spotify): historial ("Anteriores"), la canción actual y
 * "Siguiente de: {contexto}". Las filas REPRODUCEN (`jumpTo`): saltan dentro de
 * la misma cola sin perder el contexto ni la radio encadenada.
 *
 * El scroll vive en el panel (no hay scroller anidado): esta lista se puede
 * recorrer hacia arriba para ver lo ya reproducido. El motor prefetchea 2
 * canciones de margen y encadena la radio al agotarse, así que el estado de
 * "fin" solo aparece cuando la cadena fue realmente estéril.
 */
function QueuePanel({
  queue,
  current,
  contextLabel,
  playing,
  playedIds,
  hasNext,
  isExtending,
  prefetchFailed,
  active,
  onJump,
  onRetry,
}: {
  queue: Song[];
  current: Song;
  contextLabel: string | null;
  playing: boolean;
  playedIds: ReadonlySet<string>;
  hasNext: boolean;
  isExtending: boolean;
  prefetchFailed: boolean;
  /** La tab Cola está visible (auto-scroll inicial a "Sonando"). */
  active: boolean;
  onJump: (songId: string) => void;
  onRetry: () => void;
}) {
  const currentIndex = queue.findIndex((song) => song.id === current.id);
  // Historial: tope SOLO de render (100 filas antes de la actual), en orden
  // natural: la anterior inmediata queda pegada a "Sonando".
  const previous =
    currentIndex > 0
      ? queue.slice(Math.max(0, currentIndex - 100), currentIndex)
      : [];
  const upcoming =
    currentIndex >= 0
      ? queue.slice(currentIndex + 1)
      : queue.filter((song) => song.id !== current.id);

  const nowRowRef = React.useRef<HTMLLIElement | null>(null);
  // El centrado de "Sonando" es UNA vez por apertura del fullscreen: al volver
  // a la tab Cola manda la memoria de scroll, no el auto-scroll. El componente
  // se desmonta con el fullscreen, así que el ref arranca en false cada vez.
  const centeredQueueRef = React.useRef(false);

  // Al abrir/activar la tab, centra la fila "Sonando". NO depende de `current`:
  // no debe saltar cada vez que avanza la canción.
  React.useEffect(() => {
    if (!active || centeredQueueRef.current) return;
    const row = nowRowRef.current;
    if (!row) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({
      block: "center",
      behavior: reduce ? "auto" : "smooth",
    });
    centeredQueueRef.current = true;
  }, [active]);

  // Texto de la live region: se calcula siempre (el span está montado desde el
  // inicio, así los cambios SÍ se anuncian). Vacío cuando hay material a la
  // vista (no hay nada que anunciar).
  const liveMessage =
    upcoming.length > 0
      ? ""
      : !hasNext
        ? "El autoplay se detuvo."
        : prefetchFailed
          ? "Sin conexión: no pudimos traer más canciones."
          : isExtending
            ? "Generando radio…"
            : "Buscando más canciones…";

  return (
    <div className="mx-auto w-full max-w-xl">
      <h3 className="mb-4 text-center font-display text-sm font-semibold uppercase tracking-[0.2em] text-text-subdued">
        Cola
      </h3>

      {/* Live region SIEMPRE montada: una que nace junto con el skeleton no se
          anuncia (aria-live solo reporta cambios posteriores al mount). */}
      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>

      {previous.length > 0 && (
        <section aria-labelledby="queue-prev-heading" className="mb-6">
          <h4
            id="queue-prev-heading"
            className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-text-subdued/70"
          >
            Anteriores
          </h4>
          <ul className="flex flex-col gap-1">
            {previous.map((song) => (
              <QueueRow
                key={song.id}
                song={song}
                played={playedIds.has(song.id)}
                onSelect={() => onJump(song.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="queue-now-heading">
        <h4
          id="queue-now-heading"
          className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-text-subdued/70"
        >
          Sonando
        </h4>
        <ul className="flex flex-col gap-1">
          {/* La fila activa es estática: ya está sonando. */}
          <QueueRow song={current} active playing={playing} rowRef={nowRowRef} />
        </ul>
      </section>

      <section aria-labelledby="queue-next-heading" className="mt-6">
        <h4
          id="queue-next-heading"
          className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-text-subdued/70"
        >
          {contextLabel ? `Siguiente de: ${contextLabel}` : "A continuación"}
        </h4>

        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {upcoming.map((song) => (
              <QueueRow
                key={song.id}
                song={song}
                played={playedIds.has(song.id)}
                onSelect={() => onJump(song.id)}
              />
            ))}
          </ul>
        ) : (
          <QueueStatus
            hasNext={hasNext}
            prefetchFailed={prefetchFailed}
            onRetry={onRetry}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Estado de "no hay nada materializado por delante". Solo es un final real
 * cuando el autoplay ya se declaró estéril (`!hasNext`); si el motor todavía
 * puede producir, se muestra el prefetch en curso (o el reintento si falló).
 */
function QueueStatus({
  hasNext,
  prefetchFailed,
  onRetry,
}: {
  hasNext: boolean;
  prefetchFailed: boolean;
  onRetry: () => void;
}) {
  if (!hasNext) {
    return (
      <p className="rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-6 text-center text-sm text-text-subdued">
        El autoplay se detuvo.
      </p>
    );
  }

  if (prefetchFailed) {
    return (
      <div className="rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-6 text-center text-sm text-text-subdued">
        <p>Sin conexión: no pudimos traer más canciones.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={onRetry}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-highlight bg-bg-elevated/50 px-3 py-2">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center gap-3 px-1 py-2">
          <Skeleton className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Mini-row de la cola: cover 40px + título + artista. Con `onSelect` es un
 * botón que reproduce esa canción (cover incluido en el hit area); sin handler
 * (fila activa) es estática. `played` marca lo ya iniciado en esta
 * reproducción (check para el historial).
 */
function QueueRow({
  song,
  active = false,
  playing = false,
  played = false,
  onSelect,
  rowRef,
}: {
  song: Song;
  active?: boolean;
  playing?: boolean;
  /** Ya sonó en esta reproducción. */
  played?: boolean;
  /** Sin handler ⇒ fila estática (la que ya está sonando). */
  onSelect?: () => void;
  rowRef?: React.Ref<HTMLLIElement>;
}) {
  const rowContent = (
    <>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
        {song.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <NoCover size="sm" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            active && "text-brand-400"
          )}
        >
          {song.title}
        </p>
        <p className="truncate text-xs text-text-subdued">{song.artist.name}</p>
      </div>

      {played && !active && (
        <span className="shrink-0 text-text-subdued">
          <Check size={14} aria-hidden />
          <span className="sr-only">Reproducida</span>
        </span>
      )}

      {active && playing && (
        <span
          className="flex h-4 items-end gap-0.5 text-brand-400"
          aria-hidden="true"
        >
          <span className="eq-bar h-2" />
          <span className="eq-bar h-2" />
          <span className="eq-bar h-2" />
        </span>
      )}
    </>
  );

  return (
    <li
      ref={rowRef}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-lg",
        active ? "bg-bg-elevated" : "transition-colors hover:bg-bg-elevated/60"
      )}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Reproducir ${song.title}`}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          {rowContent}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2">{rowContent}</div>
      )}
    </li>
  );
}
