"use client";

import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "./utils";

const sliderVariants = cva("relative", {
  variants: {
    mode: {
      interactive:
        "flex h-6 cursor-pointer touch-none select-none items-center rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
      display: "block",
    },
  },
  defaultVariants: { mode: "interactive" },
});

const trackVariants = cva(
  "relative w-full overflow-hidden rounded-full bg-bg-highlight",
  {
    variants: {
      mode: {
        interactive: "h-1",
        display: "h-0.5",
      },
    },
    defaultVariants: { mode: "interactive" },
  }
);

interface SliderProps {
  value: number;
  max: number;
  /** Sin `onSeek` (o con `interactive={false}`) es solo display. */
  onSeek?: (value: number) => void;
  ariaLabel: string;
  ariaValueText?: string;
  /** `false` = barra de progreso no manipulable (barra inferior). */
  interactive?: boolean;
  className?: string;
}

/**
 * Slider propio (divs + Pointer Events). Reemplaza `input[type=range]`, que en
 * WebKit pinta su thumb blanco de ~26px recortado por un riel de 4px (la "barra
 * blanca" de iPhone); `accent-color` no lo cubre. Soporta drag, tap-to-seek
 * (iOS no lo hace nativo) y teclado. El thumb vive FUERA del `overflow-hidden`
 * del riel para no recortarse.
 */
export function Slider({
  value,
  max,
  onSeek,
  ariaLabel,
  ariaValueText,
  interactive = true,
  className,
}: SliderProps) {
  const [dragging, setDragging] = React.useState(false);
  /** Posición bajo el dedo durante el drag (gana sobre `value` hasta soltar). */
  const [draft, setDraft] = React.useState<number | null>(null);

  const mode = interactive ? "interactive" : "display";
  const shown = draft ?? value;
  // Guard: `duration = 0` (sin metadata) no debe generar `NaN%`.
  const ratio = max > 0 ? Math.min(1, Math.max(0, shown / max)) : 0;
  const pct = ratio * 100;

  function seekTo(clientX: number, element: HTMLElement) {
    if (max <= 0) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next =
      Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * max;
    setDraft(next);
    onSeek?.(next);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Puntero ya liberado (Safari): el drag sigue sin captura.
    }
    setDragging(true);
    // Tap-to-seek: un toque sin arrastre también salta.
    seekTo(event.clientX, event.currentTarget);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!interactive || !dragging) return;
    seekTo(event.clientX, event.currentTarget);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!interactive || max <= 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = value + 5;
    else if (event.key === "ArrowLeft") next = value - 5;
    else if (event.key === "PageUp") next = value + 10;
    else if (event.key === "PageDown") next = value - 10;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    onSeek?.(Math.min(max, Math.max(0, next)));
  }

  return (
    <div
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(Math.min(max, Math.max(0, shown)))}
      aria-valuetext={ariaValueText}
      aria-disabled={interactive ? undefined : true}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? endDrag : undefined}
      onPointerCancel={interactive ? endDrag : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={cn(sliderVariants({ mode }), className)}
    >
      <div className={trackVariants({ mode })}>
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-brand-400",
            // Al arrastrar no se anima el ancho: el thumb debe seguir al dedo.
            !dragging &&
              "transition-[width] duration-300 motion-reduce:transition-none"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Hermano del riel (no hijo): el `overflow-hidden` del riel lo recortaría.
          El clamp evita que a 0%/100% el thumb genere overflow horizontal en
          los paneles con `overflow-y: auto` (que convierte x en `auto`). */}
      {interactive && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-brand-200 ring-2 ring-bg-base"
          style={{ left: `clamp(0px, calc(${pct}% - 6px), calc(100% - 12px))` }}
        />
      )}
    </div>
  );
}
