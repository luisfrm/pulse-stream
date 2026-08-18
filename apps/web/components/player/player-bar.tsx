"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronUp, Pause, Play } from "lucide-react";

import { formatTime } from "@/lib/utils/format";
import { usePlayer } from "./player-provider";

// Lazy: el fullscreen (con OfflineButton + letra) es pesado; no debe viajar en
// el chunk del root layout ni descargarse en páginas que nunca lo abren.
const PlayerFullscreen = dynamic(
  () =>
    import("./player-fullscreen").then((m) => m.PlayerFullscreen),
  {
    ssr: false,
    loading: () => null,
  }
);

/** Barra inferior fija del reproductor. Entra animada; al tocarla abre el
 *  fullscreen. El progreso vive en una línea fina en el borde superior. */
export function PlayerBar() {
  const { current, playing, progress, duration, toggle } = usePlayer();
  const [open, setOpen] = React.useState(false);

  if (!current) return null;

  const pct = duration ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <>
      <footer className="animate-player-in fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 lg:bottom-0">
        {/* Línea de progreso fina en el borde superior de la barra */}
        <div className="h-0.5 w-full bg-bg-highlight/60">
          <div
            className="h-full bg-brand-400 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-3 border-t border-bg-highlight bg-bg-base/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Abrir reproductor: ${current.title} de ${current.artist.name}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-bg-highlight bg-bg-highlight/40">
              {current.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.cover_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="bg-brand-gradient flex h-full w-full items-center justify-center text-sm font-extrabold text-bg-base">
                  {current.title.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{current.title}</p>
              <p className="truncate text-xs text-text-subdued">
                {current.artist.name}
              </p>
            </div>

            <span className="hidden shrink-0 text-xs tabular-nums text-text-subdued sm:block">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="rounded-full bg-brand-400 p-3 text-bg-base transition-colors hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            {playing ? <Pause size={20} /> : <Play size={20} className="translate-x-[1px]" />}
          </button>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ver reproductor completo"
            className="rounded-full p-2.5 text-text-subdued transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <ChevronUp size={20} />
          </button>
        </div>
      </footer>

      <PlayerFullscreen open={open} onClose={() => setOpen(false)} />
    </>
  );
}