"use client";

import { PlayButton, usePlaySong } from "@/components/player/play-button";
import type { PlayContext } from "@/components/player/player-provider";
import { Badge, cn } from "@/components/ui";
import type { MyPlaylist, Song } from "@/lib/services/types";
import { formatGenre } from "@/lib/utils/format";
import { NoCover } from "./no-cover";
import { SongActions } from "./song-actions";

interface SongItemProps {
  song: Song;
  queue?: Song[];
  /** Contexto perezoso (tiene prioridad sobre `queue`). */
  context?: PlayContext;
  /** Si se pasan, muestra acciones de usuario (favorito + playlist). */
  favoriteIds?: Set<string>;
  playlists?: MyPlaylist[];
  onMutated?: () => Promise<void>;
}

/**
 * Fila de canción: el bloque cover + título + artista REPRODUCE (las canciones
 * no tienen página de detalle). El ▶, las badges y `SongActions` son HERMANOS
 * del área clickeable: nunca se anidan interactivos, así ♥, "+" y descarga
 * funcionan sin disparar el play por accidente.
 */
export function SongItem({
  song,
  queue,
  context,
  favoriteIds,
  playlists,
  onMutated,
}: SongItemProps) {
  const showActions = favoriteIds !== undefined;
  const { isPlaying, playSong } = usePlaySong(song, queue, context);

  const coverClass = cn(
    "h-11 w-11 shrink-0 overflow-hidden",
    song.cover_url && "rounded-lg border border-bg-highlight"
  );

  return (
    <li className="flex items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 sm:gap-4">
      <button
        type="button"
        onClick={playSong}
        aria-label={isPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
      >
        <span className={coverClass}>
          {song.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.cover_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <NoCover size="sm" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{song.title}</span>
          <span className="block truncate text-xs text-text-subdued">
            {song.artist.name}
          </span>
        </span>
      </button>
      <PlayButton song={song} queue={queue} context={context} />
      {(song.genres?.length ?? 0) > 0 && (
        <div className="hidden gap-1.5 sm:flex">
          {song.genres!.slice(0, 2).map((genre) => (
            <Badge key={genre} variant="glass" size="sm">
              {formatGenre(genre)}
            </Badge>
          ))}
        </div>
      )}
      {showActions && (
        <SongActions
          song={song}
          initialFavorited={favoriteIds!.has(song.id)}
          playlists={playlists}
          onMutated={onMutated}
        />
      )}
    </li>
  );
}
