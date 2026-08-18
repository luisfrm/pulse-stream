"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "./utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom-sheet (patrón móvil estilo Spotify/Apple Music):
 * panel que sube desde abajo con backdrop, cierre por ESC / click fuera,
 * y `aria-modal` para accesibilidad. Animación de transform/opacity
 * (respetando prefers-reduced-motion).
 */
export function BottomSheet({ open, onClose, title, children, className }: BottomSheetProps) {
  const sheetRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Panel inferior"}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm motion-safe:animate-[fade-in_150ms_ease-out]"
      />

      {/* Panel */}
      <div
        ref={sheetRef}
        className={cn(
          "relative z-10 flex max-h-[85svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-bg-highlight bg-bg-elevated shadow-2xl",
          "motion-safe:animate-[sheet-up_250ms_ease-out]",
          className
        )}
      >
        {/* Handle visual */}
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-bg-highlight" />
        </div>

        {title && (
          <div className="flex items-center justify-between px-5 pt-3">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-5 pb-6 pt-4">{children}</div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[fade-in_150ms_ease-out\\],
          .motion-safe\\:animate-\\[sheet-up_250ms_ease-out\\] {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
