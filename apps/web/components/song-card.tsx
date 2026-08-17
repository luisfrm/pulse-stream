"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";

import type { Song } from "@/lib/services/types";
import { cn } from "@/components/ui";
import { usePlayer } from "./player/player-provider";

interface SongCardProps {
  song: Song;
  queue?: Song[];
  className?: string;
}

/** Tarjeta de canción estilo Spotify: cover + play en hover + metadatos. */
export function SongCard({ song, queue, className }: SongCardProps) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === song.id;
  const isPlaying = isCurrent && playing;

  function handlePlay() {
    if (isCurrent) toggle();
    else play(song, queue);
  }

  return (
    <div
      className={cn(
        "card-lift group relative flex h-full flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3",
        className
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
        {song.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={song.cover_url}
            alt={`Cover de ${song.title}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
            <span className="font-display text-4xl font-extrabold text-bg-base">
              {song.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handlePlay}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          className={cn(
            "absolute bottom-2 right-2 rounded-full bg-brand-400 p-3 text-bg-base shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            isCurrent && "opacity-100"
          )}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-[1px]" />}
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/song/${song.id}`}
          className="block truncate font-display text-sm font-bold hover:underline"
        >
          {song.title}
        </Link>
        <Link
          href={`/artist/${song.artist.id}`}
          className="block truncate text-xs text-text-subdued hover:underline"
        >
          {song.artist.name}
        </Link>
      </div>

      {isPlaying && (
        <div className="absolute right-4 top-4 flex h-5 items-end gap-0.5 text-brand-400" aria-label="Reproduciendo">
          <span className="eq-bar h-3" />
          <span className="eq-bar h-3" />
          <span className="eq-bar h-3" />
        </div>
      )}
    </div>
  );
}