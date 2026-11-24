"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { OfflineButton } from "@/components/offline-button";
import { cn } from "@/components/ui";
import { NoCover } from "@/components/no-cover";
import type { Song } from "@/lib/services/types";
import { formatGenre, formatTime } from "@/lib/utils/format";
import { usePlayer } from "./player-provider";

interface PlayerFullscreenProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Reproductor en pantalla completa: fondo con el cover desenfocado, cover
 * grande, progreso, controles y las tabs "Ahora suena" / "Letra" / "Cola".
 * En desktop muestra cover+controles a la izquierda y la tab activa a la derecha.
 */
export function PlayerFullscreen({ open, onClose }: PlayerFullscreenProps) {
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
    progress,
    duration,
    seek,
    jumpTo,
  } = usePlayer();
  const [tab, setTab] = React.useState<"now" | "lyrics" | "queue">("now");

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !current) return null;

  const tabs = [
    { value: "now", label: "Ahora suena" },
    { value: "lyrics", label: "Letra" },
    { value: "queue", label: "Cola" },
  ] as const;

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

      {/* Header: cerrar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4">
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

      {/* Tabs (todos los tamaños: en desktop son la única forma de abrir la
          Cola) — el contenido del panel derecho cambia con la tab activa. */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 sm:overflow-hidden">
        <div className="relative flex items-center justify-center gap-1.5 pr-12 sm:pr-0">
          {tabs.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                "rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-bg-highlight text-text-primary"
                  : "text-text-subdued hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}

          {/* Descarga flotando a la derecha de las tabs (solo móvil: en desktop
              hay una con label debajo de los controles) */}
          <OfflineButton
            song={current}
            className="absolute right-0 top-1/2 -translate-y-1/2 sm:hidden"
          />
        </div>

        <div className="flex flex-1 flex-col gap-6 lg:overflow-hidden sm:grid sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:items-center">
          {/* Columna 1: cover + info + controles */}
          <div
            className={cn(
              "flex flex-col items-center gap-5",
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
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={progress}
                onChange={(e) => seek(Number(e.target.value))}
                className="h-1 w-full accent-brand-400"
                aria-label="Progreso de reproducción"
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

          {/* Columna 2: letra o cola (según la tab) */}
          <div
            className={cn(
              "min-h-0 overflow-y-auto sm:h-full",
              tab === "now" && "hidden sm:block"
            )}
          >
            {tab === "queue" ? (
              <QueuePanel
                queue={queue}
                current={current}
                contextLabel={contextLabel}
                playing={playing}
                onJump={jumpTo}
              />
            ) : (
              <LyricsPanel lyrics={current.lyrics ?? null} />
            )}
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
 * Tab "Cola" (patrón Spotify): "Sonando" con la canción actual y "Siguiente
 * de: {contexto}" con el resto materializado de `queue`. Las filas REPRODUCEN
 * (`jumpTo` del provider): saltan dentro de la misma cola sin perder el
 * contexto ni la radio encadenada. Cuando el motor extiende el contexto, los
 * items nuevos aparecen solos (estado del provider).
 */
function QueuePanel({
  queue,
  current,
  contextLabel,
  playing,
  onJump,
}: {
  queue: Song[];
  current: Song;
  contextLabel: string | null;
  playing: boolean;
  onJump: (songId: string) => void;
}) {
  const currentIndex = queue.findIndex((song) => song.id === current.id);
  // Sólo lo que viene DESPUÉS de la actual (Spotify no muestra las pasadas).
  const upcoming =
    currentIndex >= 0
      ? queue.slice(currentIndex + 1)
      : queue.filter((song) => song.id !== current.id);

  return (
    <div className="mx-auto w-full max-w-xl">
      <h3 className="mb-4 text-center font-display text-sm font-semibold uppercase tracking-[0.2em] text-text-subdued">
        Cola
      </h3>

      <p
        id="queue-now-heading"
        className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-text-subdued/70"
      >
        Sonando
      </p>
      <ul aria-labelledby="queue-now-heading">
        {/* La fila activa es estática: ya está sonando. */}
        <QueueRow song={current} active playing={playing} />
      </ul>

      <p
        id="queue-next-heading"
        className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-widest text-text-subdued/70"
      >
        {contextLabel ? `Siguiente de: ${contextLabel}` : "A continuación"}
      </p>

      {upcoming.length === 0 ? (
        <p className="rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-6 text-center text-sm text-text-subdued">
          {queue.length > 0
            ? "No hay más canciones en esta cola."
            : "La cola aparece cuando reproduzcas algo."}
        </p>
      ) : (
        <ul
          aria-labelledby="queue-next-heading"
          className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-none"
        >
          {upcoming.map((song) => (
            <QueueRow
              key={song.id}
              song={song}
              onSelect={() => onJump(song.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Mini-row de la cola: cover 40px + título + artista. Con `onSelect` es un
 * botón que reproduce esa canción (cover incluido en el hit area); sin handler
 * (fila activa) es estática.
 */
function QueueRow({
  song,
  active = false,
  playing = false,
  onSelect,
}: {
  song: Song;
  active?: boolean;
  playing?: boolean;
  /** Sin handler ⇒ fila estática (la que ya está sonando). */
  onSelect?: () => void;
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
