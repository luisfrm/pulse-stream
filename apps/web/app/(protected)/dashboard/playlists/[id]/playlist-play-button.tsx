"use client";

import { Pause, Play } from "lucide-react";

import { usePlayer } from "@/components/player/player-provider";
import { Button } from "@/components/ui";
import type { Song } from "@/lib/services/types";

interface PlaylistPlayButtonProps {
  songs: Song[];
}

/**
 * Reproduce la playlist completa: inicia la primera canción con la cola =
 * todas las canciones de la playlist (el reproductor avanza solo).
 */
export function PlaylistPlayButton({ songs }: PlaylistPlayButtonProps) {
  const { current, playing, play, toggle } = usePlayer();
  const isCurrentFromThis =
    current !== null && songs.some((s) => s.id === current.id);
  const isPlaying = isCurrentFromThis && playing;

  function handleClick() {
    if (isCurrentFromThis) {
      toggle();
    } else if (songs.length > 0) {
      play(songs[0], songs);
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={songs.length === 0}
      aria-label={isPlaying ? "Pausar playlist" : "Reproducir playlist"}
    >
      {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      {isPlaying ? "Pausar" : "Reproducir"}
    </Button>
  );
}
