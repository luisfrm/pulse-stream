"use client";

import * as React from "react";

import type { Song } from "@/lib/services/types";

interface PlayerState {
  current: Song | null;
  queue: Song[];
  playing: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  play: (song: Song, queue?: Song[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
}

const PlayerContext = React.createContext<PlayerState | null>(null);

/**
 * Reproductor persistente: vive en el root layout, sobrevive a la navegación.
 * Cualquier página puede llamar `play(song, queue)` desde un botón.
 * Integra Media Session API (controles de pantalla de bloqueo / notificaciones).
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = React.useState<Song | null>(null);
  const [queue, setQueue] = React.useState<Song[]>([]);
  const [playing, setPlaying] = React.useState(false);

  // Asegura un único <audio> reutilizable
  React.useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const currentIndex = current
    ? queue.findIndex((s) => s.id === current.id)
    : -1;

  function play(song: Song, nextQueue?: Song[]) {
    const q = nextQueue ?? queue;
    setQueue(q);
    setCurrent(song);

    const audio = audioRef.current;
    if (!audio) return;
    audio.src = song.stream_url ?? "";
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function next() {
    if (currentIndex === -1 || currentIndex >= queue.length - 1) return;
    play(queue[currentIndex + 1], queue);
  }

  function prev() {
    if (currentIndex <= 0) return;
    play(queue[currentIndex - 1], queue);
  }

  // Media Session API: metadata + controles del sistema operativo
  React.useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist.name,
      album: "Pulse Stream",
    });

    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Sincroniza `playing` con el estado real del <audio> (fin de canción, etc.)
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      if (currentIndex >= 0 && currentIndex < queue.length - 1) {
        next();
      } else {
        setPlaying(false);
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, queue]);

  const value = React.useMemo<PlayerState>(
    () => ({
      current,
      queue,
      playing,
      hasPrev: currentIndex > 0,
      hasNext: currentIndex >= 0 && currentIndex < queue.length - 1,
      play,
      toggle,
      next,
      prev,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, queue, playing, currentIndex]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerState {
  const ctx = React.useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer debe usarse dentro de <PlayerProvider>");
  return ctx;
}
