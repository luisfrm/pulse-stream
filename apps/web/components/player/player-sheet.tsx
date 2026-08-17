"use client";

import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { BottomSheet } from "@/components/ui";
import { usePlayer } from "./player-provider";

interface PlayerSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Bottom-sheet del reproductor: al tocar la barra inferior se despliega
 * la canción en grande (cover, título, artista, progreso, controles).
 */
export function PlayerSheet({ open, onClose }: PlayerSheetProps) {
  const { current, playing, toggle, next, prev, hasPrev, hasNext, progress, duration, seek } =
    usePlayer();

  if (!current) return null;

  function format(seconds: number) {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Reproduciendo">
      <div className="flex flex-col items-center gap-6">
        {/* Cover grande */}
        <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border border-bg-highlight bg-bg-highlight/40">
          {current.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.cover_url}
              alt={`Cover de ${current.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
              <span className="font-display text-5xl font-extrabold text-bg-base">
                {current.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="w-full text-center">
          <h3 className="font-display truncate text-2xl font-bold">
            {current.title}
          </h3>
          <Link
            href={`/artist/${current.artist.id}`}
            onClick={onClose}
            className="mt-1 block text-base text-brand-400 hover:underline"
          >
            {current.artist.name}
          </Link>
        </div>

        {/* Progreso */}
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
          <div className="mt-1 flex justify-between text-xs text-text-subdued">
            <span>{format(progress)}</span>
            <span>{format(duration)}</span>
          </div>
        </div>

        {/* Controles grandes */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={prev}
            disabled={!hasPrev}
            aria-label="Anterior"
            className="rounded-pill p-3 text-text-primary transition-colors hover:bg-bg-highlight disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <SkipBack size={28} />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="rounded-pill bg-brand-400 p-5 text-bg-base transition-colors hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            {playing ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button
            type="button"
            onClick={next}
            disabled={!hasNext}
            aria-label="Siguiente"
            className="rounded-pill p-3 text-text-primary transition-colors hover:bg-bg-highlight disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <SkipForward size={28} />
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
