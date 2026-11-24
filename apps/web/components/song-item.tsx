"use client";

import Link from "next/link";

import { PlayButton } from "@/components/player/play-button";
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

/** Fila de canción: play persistente + cover + metadatos + acciones. */
export function SongItem({
  song,
  queue,
  context,
  favoriteIds,
  playlists,
  onMutated,
}: SongItemProps) {
  const showActions = favoriteIds !== undefined;

  return (
    <li className="flex items-center gap-4 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
      <Link
        href={`/song/${song.id}`}
        // El link de la imagen duplica el link del título (hermano siguiente):
        // sin esto queda un link focusable sin nombre accesible (img alt="").
        aria-label={`Abrir ${song.title}`}
        className={cn(
          "h-11 w-11 shrink-0 overflow-hidden",
          song.cover_url && "rounded-lg border border-bg-highlight"
        )}
      >
        {song.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <NoCover size="sm" />
        )}
      </Link>
      <PlayButton song={song} queue={queue} context={context} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/song/${song.id}`}
          className="block truncate font-medium hover:underline"
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
