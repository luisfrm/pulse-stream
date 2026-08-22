"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/components/ui";

interface LoadMoreButtonProps {
  /** Se llama cuando el usuario quiere la siguiente página. */
  onClick: () => void;
  /** Si está en fetch. */
  loading: boolean;
  /** Si hay más items por cargar. Cuando es false, muestra "No hay más". */
  hasMore: boolean;
  /** Texto del botón (default "Ver más"). */
  label?: string;
  /** Texto final cuando ya no hay más (default "No hay más resultados"). */
  doneLabel?: string;
  className?: string;
}

/**
 * Botón "Ver más" estándar para listas paginadas client-side.
 * Cuando no hay más, se renderiza solo el mensaje sutil centrado.
 */
export function LoadMoreButton({
  onClick,
  loading,
  hasMore,
  label = "Ver más",
  doneLabel = "No hay más resultados",
  className,
}: LoadMoreButtonProps) {
  if (!hasMore) {
    return (
      <p className="py-4 text-center text-xs text-text-subdued">{doneLabel}</p>
    );
  }

  return (
    <div className={cn("flex items-center justify-center py-4", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-pill border border-bg-highlight bg-bg-elevated px-5 py-2 text-sm font-medium text-text-primary transition-colors hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 size={15} className="animate-spin" aria-hidden />
            Cargando…
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
