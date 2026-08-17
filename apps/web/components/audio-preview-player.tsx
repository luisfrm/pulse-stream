"use client";

import * as React from "react";
import { Loader2, Pause, Play } from "lucide-react";

import { cn } from "@/components/ui";
import { formatTime } from "@/lib/utils/format";
import {
  claimAudio,
  releaseAudio,
  type AudioHandle,
} from "@/components/player/audio-orchestrator";

interface AudioPreviewPlayerProps {
  src: string;
  title?: string;
  className?: string;
}

/**
 * Reproductor de PREVIEW personalizado (panel): botón circular con gradiente
 * de marca, barra de progreso clicable y tiempo. No es el player global de la
 * app — compite por el turno vía el orquestador de audio: si una canción del
 * reproductor global está sonando, este preview la pausa al empezar (y
 * viceversa). El visualizer (ecualizador) solo aparece en el preview activo.
 */
export function AudioPreviewPlayer({ src, title, className }: AudioPreviewPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const handleRef = React.useRef<AudioHandle>({
    pause: () => audioRef.current?.pause(),
  });
  const [playing, setPlaying] = React.useState(false);
  const [buffering, setBuffering] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio(src);
      audio.preload = "metadata";
      audioRef.current = audio;

      audio.addEventListener("loadedmetadata", () => setDuration(audio.duration || 0));
      audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
      audio.addEventListener("play", () => {
        claimAudio(handleRef.current);
        setPlaying(true);
        setBuffering(false);
      });
      audio.addEventListener("pause", () => {
        releaseAudio(handleRef.current);
        setPlaying(false);
      });
      audio.addEventListener("waiting", () => setBuffering(true));
      audio.addEventListener("playing", () => setBuffering(false));
      audio.addEventListener("ended", () => {
        releaseAudio(handleRef.current);
        setPlaying(false);
        setCurrentTime(0);
      });
      audio.addEventListener("error", () => setBuffering(false));
    }
    return audioRef.current;
  }

  React.useEffect(() => {
    const handle = handleRef.current;
    return () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      releaseAudio(handle);
      audio.src = "";
    };
  }, []);

  function toggle() {
    const audio = ensureAudio();
    if (audio.paused) {
      // claimAudio ocurre en el evento "play": pausa la canción global si suena.
      try {
        audio.play();
      } catch {
        // Autoplay bloqueado (sin interacción previa) — no es fatal.
      }
    } else {
      audio.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = ensureAudio();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = ratio * (audio.duration || 0);
    audio.currentTime = t;
    setCurrentTime(t);
  }

  function seekBy(delta: number) {
    const audio = ensureAudio();
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
    setCurrentTime(audio.currentTime);
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pausar ${title ?? "preview"}` : `Reproducir ${title ?? "preview"}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-bg-base transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {buffering ? (
          <Loader2 size={16} className="animate-spin" />
        ) : playing ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="Progreso de la preview"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={currentTime}
          tabIndex={0}
          onClick={seek}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              seekBy(5);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              seekBy(-5);
            }
          }}
          className="flex h-4 cursor-pointer items-center outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-bg-highlight">
            <div
              className="bg-brand-gradient absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
            />
          </div>
        </div>
        <p className="mt-0.5 text-[11px] tabular-nums text-text-subdued">
          {formatTime(currentTime)} / {formatTime(duration)}
        </p>
      </div>

      {/* Visualizer: solo en el preview que está sonando (widget activo) */}
      <span
        className="flex h-4 shrink-0 items-end gap-0.5 text-brand-400"
        aria-hidden={!playing}
        aria-label={playing ? "Reproduciendo preview" : undefined}
      >
        {playing && (
          <>
            <span className="eq-bar h-3" />
            <span className="eq-bar h-3" />
            <span className="eq-bar h-3" />
          </>
        )}
      </span>
    </div>
  );
}