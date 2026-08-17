"use client";

import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui";
import type { Song } from "@/lib/services/types";
import { usePlayer } from "./player-provider";

interface PlayButtonProps {
  song: Song;
  queue?: Song[];
  size?: "sm" | "md" | "lg";
}

/** Botón play/pausa por canción — carga la canción en el reproductor persistente. */
export function PlayButton({ song, queue, size = "sm" }: PlayButtonProps) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrent = current?.id === song.id;
  const isPlaying = isCurrent && playing;

  function handleClick() {
    if (isCurrent) {
      toggle();
    } else {
      play(song, queue);
    }
  }

  return (
    <Button
      variant={isCurrent ? "primary" : "outline"}
      size={size}
      aria-label={isPlaying ? "Pausar" : "Reproducir"}
      onClick={handleClick}
    >
      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
    </Button>
  );
}
