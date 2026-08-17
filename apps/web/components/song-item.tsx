"use client";

import Link from "next/link";

import { PlayButton } from "@/components/player/play-button";
import { Badge } from "@/components/ui";
import type { Song } from "@/lib/services/types";

interface SongItemProps {
  song: Song;
  queue?: Song[];
}

/** Fila de canción: play persistente + metadatos (título, artista, géneros). */
export function SongItem({ song, queue }: SongItemProps) {
  return (
    <li className="flex items-center gap-4 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
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
              {genre}
            </Badge>
          ))}
        </div>
      )}
    </li>
  );
}
