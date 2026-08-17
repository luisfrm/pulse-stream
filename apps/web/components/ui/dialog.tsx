"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "./utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Diálogo modal centrado (confirmaciones, formularios): backdrop + ESC /
 * click fuera para cerrar + `aria-modal`. Animación de opacity/rise
 * (respetando prefers-reduced-motion). Complementa a BottomSheet para
 * superficies que no son de pantalla completa.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Diálogo"}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm motion-safe:animate-fade-in"
      />

      {/* Panel */}
      <div
        className={cn(
          "relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-bg-highlight bg-bg-elevated shadow-2xl",
          "motion-safe:animate-rise",
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-bg-highlight px-5 py-4">
            <div className="min-w-0">
              {title && <h2 className="font-display text-lg font-bold">{title}</h2>}
              {description && (
                <p className="mt-0.5 text-sm text-text-subdued">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-pill p-1.5 text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}