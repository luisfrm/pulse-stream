"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";

import type { Playlist, Song } from "@/lib/services/types";
import { cn } from "@/components/ui";
import { usePlayer } from "./player/player-provider";
import { FavoriteButton } from "./favorite-button";
import { PlaylistPicker } from "./playlist-picker";

interface SongCardProps {
  song: Song;
  queue?: Song[];
  className?: string;
  /** Badge superior (ej. "3×" = plays del usuario en recientes). */
  badge?: string;
  /** Con sesión: playlists del usuario → corner con "+" (PlaylistPicker). */
  playlists?: Playlist[];
  /** Con sesión: IDs favoritos → corner con corazón. */
  favoriteIds?: Set<string>;
  onMutated?: () => Promise<void>;
}

/** Tarjeta de canción estilo Spotify: cover + play en hover + metadatos. */
export function SongCard({
  song,
  queue,
  className,
  badge,
  playlists,
  favoriteIds,
  onMutated,
}: SongCardProps) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === song.id;
  const isPlaying = isCurrent && playing;

  // Sin props de usuario NO se renderiza nada (home público y cards sin sesión).
  const showPicker = playlists !== undefined;
  const showHeart = favoriteIds !== undefined;
  const showActions = showPicker || showHeart;

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
            // Desktop: se revela al hover/focus; touch (mobile): siempre visible
            // porque no hay hover — sin esto no hay forma de reproducir sin entrar al detalle.
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
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

      {/* Acciones de usuario (solo con sesión): corazón + "+" en el corner.
          El ecualizador se corre a la izquierda para no pisarse. */}
      {showActions && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          {showHeart && (
            <FavoriteButton
              songId={song.id}
              initialFavorited={favoriteIds!.has(song.id)}
              onMutated={onMutated}
              className="bg-bg-base/70 backdrop-blur-sm hover:bg-bg-highlight/80"
            />
          )}
          {showPicker && (
            <PlaylistPicker
              song={song}
              playlists={playlists}
              onMutated={onMutated}
              triggerClassName="bg-bg-base/70 backdrop-blur-sm hover:bg-bg-highlight/80"
            />
          )}
        </div>
      )}

      {isPlaying && (
        <div
          className={cn(
            "absolute top-4 flex h-5 items-end gap-0.5 text-brand-400",
            showActions ? "left-4" : "right-4"
          )}
          aria-label="Reproduciendo"
        >
          <span className="eq-bar h-3" />
          <span className="eq-bar h-3" />
          <span className="eq-bar h-3" />
        </div>
      )}

      {badge && !isPlaying && (
        <span className="absolute left-4 top-4 rounded-pill bg-bg-base/80 px-2.5 py-1 text-[11px] font-bold text-text-subdued backdrop-blur-sm">
          {badge}
        </span>
      )}
    </div>
  );
}
