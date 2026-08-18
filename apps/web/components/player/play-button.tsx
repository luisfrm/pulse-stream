"use client";

import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui";
import type { Song } from "@/lib/services/types";
import { usePlayer } from "./player-provider";

interface PlayButtonProps {
  song: Song;
  queue?: Song[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Botón play/pausa por canción — carga la canción en el reproductor persistente. */
export function PlayButton({ song, queue, size = "sm", className }: PlayButtonProps) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === song.id;
  const isPlaying = isCurrent && playing;
  const iconSize = size === "lg" ? 26 : size === "md" ? 20 : 16;

  function handleClick() {
    if (isCurrent) {
      toggle();
    } else {
      play(song, queue);
    }
  }

  return (
    <Button
      variant="primary"
      size={size}
      className={className}
      aria-label={isPlaying ? "Pausar" : "Reproducir"}
      onClick={handleClick}
    >
      {isPlaying ? <Pause size={iconSize} /> : <Play size={iconSize} />}
    </Button>
  );
}
