"use client";

import { Pause, Play } from "lucide-react";

import {
  playlistContext,
  playlistContextKey,
} from "@/components/player/play-contexts";
import { usePlayer } from "@/components/player/player-provider";
import { Button } from "@/components/ui";
import type { Song } from "@/lib/services/types";

interface PlaylistPlayButtonProps {
  playlistId: string;
  playlistName: string;
  /** Primera página ya renderizada (semilla del contexto). */
  songs: Song[];
  total?: number;
}

/**
 * Reproduce la playlist completa desde la primera canción. La cola es un
 * `PlayContext` paginado: arranca con lo renderizado y el motor sigue trayendo
 * canciones por posición a medida que avanza (playlist de 300 → 300).
 */
export function PlaylistPlayButton({
  playlistId,
  playlistName,
  songs,
  total,
}: PlaylistPlayButtonProps) {
  const { current, playing, contextLabel, contextKey, play, toggle } =
    usePlayer();
  // Identidad por KEY (dos playlists homónimas no se confunden con el label);
  // fallback al label para contextos sin `key`.
  const isCurrentFromThis =
    current !== null &&
    (contextKey !== null
      ? contextKey === playlistContextKey(playlistId)
      : contextLabel === `Playlist: ${playlistName}`);
  const isPlaying = isCurrentFromThis && playing;

  function handleClick() {
    if (isCurrentFromThis) {
      toggle();
    } else if (songs.length > 0) {
      play(
        songs[0],
        playlistContext({ playlistId, playlistName, seed: songs, total }),
      );
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
