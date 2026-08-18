"use client";

import * as React from "react";

import { listensService } from "@/lib/services/listens-service";
import type { Song } from "@/lib/services/types";
import { claimAudio, releaseAudio, type AudioHandle } from "./audio-orchestrator";

interface PlayerState {
  current: Song | null;
  queue: Song[];
  playing: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  progress: number;
  duration: number;
  play: (song: Song, queue?: Song[]) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
}

const PlayerContext = React.createContext<PlayerState | null>(null);

/**
 * Marca en memoria de "ya sabemos que hay sesión": evita repetir 401 de
 * `POST /me/listens` por cada play de un usuario anónimo.
 *
 * NO se puede leer la cookie `session` desde JS (es HttpOnly — ver
 * `apps/api/app/features/auth/backend.py`), así que la detección no puede
 * basarse en `document.cookie`.
 */
let knownAuthenticated: boolean | null = null;

/**
 * Reproductor persistente: un único <audio> global en el root layout,
 * sobrevive a la navegación. `play(song, queue)` lo carga desde cualquier
 * página; integra Media Session API (controles de pantalla de bloqueo).
 * Registra cada play (POST /me/listens) cuando una canción empieza a sonar.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const handleRef = React.useRef<AudioHandle | null>(null);
  const [current, setCurrent] = React.useState<Song | null>(null);
  const [queue, setQueue] = React.useState<Song[]>([]);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  const recordPlay = React.useCallback((song: Song) => {
    // Fire-and-forget: el backend deduplica plays consecutivos. Si no hay
    // sesión el POST devuelve 401 y lo ignoramos (una vez, con memoria).
    if (knownAuthenticated === false) return;
    listensService
      .recordPlay(song.id)
      .then(() => {
        knownAuthenticated = true;
      })
      .catch(() => {
        knownAuthenticated = false;
      });
  }, []);

  React.useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    // Handle estable del reproductor global para el orquestador de audio.
    handleRef.current = {
      pause: () => {
        audio.pause();
      },
    };
    return () => {
      audio.pause();
      if (handleRef.current) releaseAudio(handleRef.current);
      audioRef.current = null;
      handleRef.current = null;
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
    // Toma el turno: pausa cualquier preview/audio activo.
    if (handleRef.current) claimAudio(handleRef.current);
    audio.src = song.stream_url ?? "";
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function pause() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    if (handleRef.current) releaseAudio(handleRef.current);
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      if (handleRef.current) claimAudio(handleRef.current);
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      pause();
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

  function seek(time: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setProgress(time);
  }

  // Media Session API: metadata + controles del sistema operativo
  React.useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist.name,
      album: "Pulse Stream",
      artwork: current.cover_url
        ? [{ src: current.cover_url, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Sincroniza estado con el <audio> (fin de canción, progreso, duración,
  // y registro de cada play cuando realmente empieza a sonar).
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      if (currentIndex >= 0 && currentIndex < queue.length - 1) {
        next();
      } else {
        setPlaying(false);
        if (handleRef.current) releaseAudio(handleRef.current);
      }
    };
    const onPause = () => {
      setPlaying(false);
      if (handleRef.current) releaseAudio(handleRef.current);
    };
    const onPlay = () => {
      setPlaying(true);
      if (current) recordPlay(current);
    };
    const onTime = () => setProgress(audio.currentTime);
    const onLoaded = () => {
      setDuration(audio.duration || 0);
      setProgress(audio.currentTime);
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
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
      progress,
      duration,
      play,
      toggle,
      pause,
      next,
      prev,
      seek,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, queue, playing, progress, duration, currentIndex]
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