"use client";

import Link from "next/link";

import { PlayButton } from "@/components/player/play-button";
import { Badge } from "@/components/ui";
import type { Playlist, Song } from "@/lib/services/types";
import { formatGenre } from "@/lib/utils/format";
import { SongActions } from "./song-actions";

interface SongItemProps {
  song: Song;
  queue?: Song[];
  /** Si se pasan, muestra acciones de usuario (favorito + playlist). */
  favoriteIds?: Set<string>;
  playlists?: Playlist[];
  onMutated?: () => Promise<void>;
}

/** Fila de canción: play persistente + cover + metadatos + acciones. */
export function SongItem({ song, queue, favoriteIds, playlists, onMutated }: SongItemProps) {
  const showActions = favoriteIds !== undefined;

  return (
    <li className="flex items-center gap-4 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
      {song.cover_url ? (
        <Link
          href={`/song/${song.id}`}
          className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-bg-highlight"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
        </Link>
      ) : null}
      <PlayButton song={song} queue={queue} />
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
