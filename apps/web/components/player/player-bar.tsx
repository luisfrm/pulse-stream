"use client";

import * as React from "react";

import { usePlayer } from "./player-provider";
import { PlayerSheet } from "./player-sheet";

/** Barra fija inferior: al tocar cualquier parte se abre el bottom-sheet. */
export function PlayerBar() {
  const { current, playing, progress, duration } = usePlayer();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  if (!current) return null;

  function format(seconds: number) {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <>
      <footer className="fixed inset-x-0 bottom-0 z-40">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Abrir reproductor: ${current.title} de ${current.artist.name}`}
          className="w-full border-t border-bg-highlight bg-bg-base/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 text-left backdrop-blur-md transition-colors hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-4">
            {/* Mini cover */}
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
              <p className="truncate font-medium">{current.title}</p>
              <p className="truncate text-xs text-text-subdued">
                {current.artist.name}
              </p>
              {/* Barra de progreso fina */}
              <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-bg-highlight">
                <div
                  className="h-full bg-brand-400 transition-[width] duration-300"
                  style={{
                    width: duration
                      ? `${Math.min(100, (progress / duration) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
            </div>

            <span className="hidden shrink-0 text-xs tabular-nums text-text-subdued sm:block">
              {format(progress)} / {format(duration)}
            </span>

            <span
              role="img"
              aria-label={playing ? "Reproduciendo" : "Pausado"}
              className="text-sm text-text-subdued"
            >
              {playing ? "♪" : "⏸"}
            </span>
          </div>
        </button>
      </footer>

      <PlayerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
