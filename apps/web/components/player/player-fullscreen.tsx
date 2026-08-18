"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { OfflineButton } from "@/components/offline-button";
import { cn } from "@/components/ui";
import { formatGenre, formatTime } from "@/lib/utils/format";
import { usePlayer } from "./player-provider";

interface PlayerFullscreenProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Reproductor en pantalla completa: fondo con el cover desenfocado, cover
 * grande, progreso, controles y la letra en un bloque tipográfico elegante.
 * En desktop muestra cover+controles a la izquierda y la letra a la derecha.
 */
export function PlayerFullscreen({ open, onClose }: PlayerFullscreenProps) {
  const { current, playing, toggle, next, prev, hasPrev, hasNext, progress, duration, seek } =
    usePlayer();
  const [tab, setTab] = React.useState<"now" | "lyrics">("now");

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

  const hasLyrics = Boolean(current.lyrics?.trim());

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

      {/* Tabs (móvil) / división (desktop) — en móvil el contenido scrollea
          (svh + overflow-y-auto) para que nada quede cortado; en desktop se
          mantiene fijo con scroll interno en la letra. */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 sm:overflow-hidden">
        <div className="relative flex items-center justify-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setTab("now")}
            className={cn(
              "rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "now"
                ? "bg-bg-highlight text-text-primary"
                : "text-text-subdued hover:text-text-primary"
            )}
          >
            Ahora suena
          </button>
          <button
            type="button"
            onClick={() => setTab("lyrics")}
            className={cn(
              "rounded-pill px-4 py-1.5 text-sm font-medium transition-colors",
              tab === "lyrics"
                ? "bg-bg-highlight text-text-primary"
                : "text-text-subdued hover:text-text-primary"
            )}
          >
            Letra
          </button>

          {/* Descarga flotando a la derecha de las tabs (móvil) */}
          <OfflineButton
            song={current}
            className="absolute right-0 top-1/2 -translate-y-1/2"
          />
        </div>

        <div className="flex flex-1 flex-col gap-6 lg:overflow-hidden sm:grid sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] sm:items-center">
          {/* Columna 1: cover + info + controles */}
          <div
            className={cn(
              "flex flex-col items-center gap-5",
              tab === "lyrics" && "hidden sm:flex"
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
                <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
                  <span className="font-display text-6xl font-extrabold text-bg-base">
                    {current.title.charAt(0).toUpperCase()}
                  </span>
                </div>
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

          {/* Columna 2: letra */}
          <div
            className={cn(
              "min-h-0 overflow-y-auto sm:h-full",
              tab === "now" && "hidden sm:block"
            )}
          >
            <h3 className="mb-4 text-center font-display text-sm font-semibold uppercase tracking-[0.2em] text-text-subdued">
              Letra
            </h3>
            {hasLyrics ? (
              <div className="mx-auto max-w-xl space-y-6">
                {current.lyrics!
                  .split(/\n{2,}/)
                  .map((stanza, index) => (
                    <div key={index} className="space-y-3">
                      {stanza
                        .split("\n")
                        .filter(Boolean)
                        .map((line, lineIndex) => (
                          <p
                            key={lineIndex}
                            className="font-display text-lg font-medium leading-relaxed text-text-primary/90"
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
          </div>
        </div>
      </div>
    </div>
  );
}