"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import type { MyPlaylist, Song } from "@/lib/services/types";
import { songAnchoredContext } from "./player/play-contexts";
import { usePlayer, type PlayContext } from "./player/player-provider";
import { MediaCard } from "./media-card";

// Solo se usan con sesión (corner de la card). dynamic → chunk separado que el
// home anónimo y las vistas sin sesión nunca descargan (ahorra JS en el path
// crítico del LCP). SSR intacto: con sesión se renderizan igual.
const FavoriteButton = dynamic(() =>
  import("./favorite-button").then((m) => m.FavoriteButton)
);
const PlaylistPicker = dynamic(() =>
  import("./playlist-picker").then((m) => m.PlaylistPicker)
);

interface SongCardProps {
  song: Song;
  queue?: Song[];
  /** Contexto perezoso (tiene prioridad sobre `queue`). */
  context?: PlayContext;
  className?: string;
  /** Badge superior (ej. "3×" = plays del usuario en recientes). */
  badge?: string;
  /** Con sesión: playlists del usuario → corner con "+" (PlaylistPicker). */
  playlists?: MyPlaylist[];
  /** Con sesión: IDs favoritos → corner con corazón. */
  favoriteIds?: Set<string>;
  onMutated?: () => Promise<void>;
  /** Prioriza la carga de la imagen (LCP): eager + high priority para las primeras cards del viewport. */
  priority?: boolean;
}

/** Card de canción: MediaCard con el play del reproductor global y las acciones de sesión. */
export function SongCard({
  song,
  queue,
  context,
  className,
  badge,
  playlists,
  favoriteIds,
  onMutated,
  priority = false,
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
    else {
      // Sin fuente, la cola se ancla a la canción (radio del artista). Así las
      // superficies RSC (home público) no tienen que pasar funciones.
      play(song, context ?? queue ?? songAnchoredContext({ song }));
    }
  }

  return (
    <MediaCard
      title={song.title}
      coverUrl={song.cover_url}
      subtitle={
        <Link
          href={`/artist/${song.artist.id}`}
          className="min-h-6 line-clamp-2 hover:underline"
        >
          {song.artist.name}
        </Link>
      }
      badge={badge}
      actions={
        showActions ? (
          <>
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
          </>
        ) : undefined
      }
      playing={isPlaying}
      onPlay={handlePlay}
      onSelect={handlePlay}
      className={className}
      priority={priority}
    />
  );
}
