"use client";

import Link from "next/link";

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
  /**
   * Toda la fila (cover + título + artista) REPRODUCE en vez de navegar. Las
   * superficies de exploración (/songs, catálogo, búsqueda…) lo dejan apagado:
   * ahí tocar el título sigue abriendo el detalle.
   */
  playOnClick?: boolean;
}

/** Fila de canción: play persistente + cover + metadatos + acciones. */
export function SongItem({
  song,
  queue,
  context,
  favoriteIds,
  playlists,
  onMutated,
  playOnClick = false,
}: SongItemProps) {
  const showActions = favoriteIds !== undefined;
  const { isPlaying, playSong } = usePlaySong(song, queue, context);

  const coverClass = cn(
    "h-11 w-11 shrink-0 overflow-hidden",
    song.cover_url && "rounded-lg border border-bg-highlight"
  );
  const cover = song.cover_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
  ) : (
    <NoCover size="sm" />
  );

  return (
    <li className="flex items-center gap-4 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
      {playOnClick ? (
        <>
          {/*
           * Área clickeable única (cover + textos). Es un `<button>` HERMANO de
           * las acciones/▶: nunca se anidan interactivos encima, así ♥, "+" y
           * descarga siguen funcionando sin abrir el reproductor por accidente.
           */}
          <button
            type="button"
            onClick={playSong}
            aria-label={
              isPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`
            }
            className="flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <span className={coverClass}>{cover}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{song.title}</span>
              <span className="block truncate text-xs text-text-subdued">
                {song.artist.name}
              </span>
            </span>
          </button>
          <PlayButton song={song} queue={queue} context={context} />
        </>
      ) : (
        <>
          <Link
            href={`/song/${song.id}`}
            // El link de la imagen duplica el link del título (hermano siguiente):
            // sin esto queda un link focusable sin nombre accesible (img alt="").
            aria-label={`Abrir ${song.title}`}
            className={coverClass}
          >
            {cover}
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
        </>
      )}
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
