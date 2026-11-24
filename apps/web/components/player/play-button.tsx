"use client";

import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui";
import type { Song } from "@/lib/services/types";
import { songAnchoredContext } from "./play-contexts";
import { usePlayer, type PlayContext } from "./player-provider";

/**
 * Estado y acción de reproducción de UNA canción, compartidos por el botón ▶ y
 * por las superficies que reproducen al tocar la fila (p. ej. las canciones de
 * una playlist). Si ya es la canción actual, alterna play/pausa; si no, la
 * carga con la fuente dada (contexto > cola > radio anclada a la canción).
 */
export function usePlaySong(
  song: Song,
  queue?: Song[],
  context?: PlayContext
): { isPlaying: boolean; playSong: () => void } {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === song.id;

  function playSong() {
    if (isCurrent) {
      toggle();
    } else {
      // Sin fuente (canción suelta) la cola se ancla a la canción: radio del
      // artista. Es lo que permite que `<PlayButton song>` desde una página de
      // detalle (RSC, no puede pasar funciones) no quede huérfano.
      play(song, context ?? queue ?? songAnchoredContext({ song }));
    }
  }

  return { isPlaying: isCurrent && playing, playSong };
}

interface PlayButtonProps {
  song: Song;
  queue?: Song[];
  /** Contexto perezoso (tiene prioridad sobre `queue`). */
  context?: PlayContext;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Botón play/pausa por canción — carga la canción en el reproductor persistente. */
export function PlayButton({
  song,
  queue,
  context,
  size = "sm",
  className,
}: PlayButtonProps) {
  const { isPlaying, playSong } = usePlaySong(song, queue, context);
  const iconSize = size === "lg" ? 26 : size === "md" ? 20 : 16;

  return (
    <Button
      variant="primary"
      size={size}
      className={className}
      aria-label={isPlaying ? "Pausar" : "Reproducir"}
      onClick={playSong}
    >
      {isPlaying ? <Pause size={iconSize} /> : <Play size={iconSize} />}
    </Button>
  );
}
