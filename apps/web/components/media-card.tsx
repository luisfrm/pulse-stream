"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";

import { cn } from "@/components/ui";
import { NoCover } from "./no-cover";

interface MediaCardProps {
  title: string;
  href: string;
  coverUrl?: string | null;
  /** `circle` para artistas. */
  shape?: "square" | "circle";
  subtitle?: React.ReactNode;
  badge?: string;
  /** Slot de la esquina superior derecha (favorito, agregar a playlist…). */
  actions?: React.ReactNode;
  /** Muestra el ecualizador y el icono de pausa. */
  playing?: boolean;
  /** Sin `onPlay` no se renderiza el botón de play. */
  onPlay?: () => void;
  /** Deshabilita el play (p. ej. mientras se carga la cola). */
  playDisabled?: boolean;
  className?: string;
  priority?: boolean;
}

/**
 * Átomo de card estilo Spotify: sin caja, la imagen manda. Cover cuadrado o
 * circular + play flotante en hover/focus y siempre visible en touch.
 * Solo la imagen se clipea: badge, acciones y play quedan afuera para que el
 * popover de PlaylistPicker no se corte y el `rounded-full` no recorte el play.
 */
export function MediaCard({
  title,
  href,
  coverUrl,
  shape = "square",
  subtitle,
  badge,
  actions,
  playing = false,
  onPlay,
  playDisabled = false,
  className,
  priority = false,
}: MediaCardProps) {
  return (
    <div className={cn("group relative flex h-full min-w-0 flex-col gap-3", className)}>
      <div className="relative aspect-square w-full">
        <div
          className={cn(
            "absolute inset-0 overflow-hidden bg-bg-highlight/40",
            shape === "circle" ? "rounded-full" : "rounded-md"
          )}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={`Cover de ${title}`}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <NoCover shape={shape} size="lg" />
          )}
        </div>

        {badge && !playing && (
          <span className="absolute left-3 top-3 rounded-pill bg-bg-base/80 px-2.5 py-1 text-[11px] font-bold text-text-subdued backdrop-blur-sm">
            {badge}
          </span>
        )}

        {playing && (
          <div className="absolute left-3 top-3 flex h-5 items-end gap-0.5 text-brand-400" aria-hidden="true">
            <span className="eq-bar h-3" />
            <span className="eq-bar h-3" />
            <span className="eq-bar h-3" />
          </div>
        )}

        {actions && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1">{actions}</div>
        )}

        {onPlay && (
          <button
            type="button"
            onClick={onPlay}
            disabled={playDisabled}
            aria-label={playing ? `Pausar ${title}` : `Reproducir ${title}`}
            className={cn(
              // Sin z-10 a propósito: el popover de PlaylistPicker (dentro de
              // `actions`, z-10 + menú z-50) debe ganar el hit-test y el pintado
              // sobre el play; por orden de DOM el play igual queda sobre la imagen.
              "absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand-400 text-bg-base shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:opacity-50",
              // Se revela al hover/focus en desktop; en touch (sin hover) va
              // siempre visible para poder reproducir sin entrar al detalle.
              "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
              playing && "opacity-100"
            )}
          >
            {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-[1px]" />}
          </button>
        )}
      </div>

      <div className="min-w-0">
        {/* min-h-6: WCAG 2.2 AA exige targets ≥24px; el span interno conserva el ellipsis. */}
        <Link
          href={href}
          className="flex min-h-6 items-center font-display text-base font-bold leading-6 hover:underline"
        >
          <span className="truncate">{title}</span>
        </Link>
        {subtitle != null && (
          <div className="line-clamp-2 text-sm text-text-subdued">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
