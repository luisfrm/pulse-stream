"use client";

import * as React from "react";
import { Heart } from "lucide-react";

import { cn } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import { friendlyError } from "@/lib/utils/error";

interface FavoriteButtonProps {
  songId: string;
  initialFavorited: boolean;
  onMutated?: () => Promise<void>;
  /** Clases extra (estilo icon-button del contexto: fila, card, corner…). */
  className?: string;
}

/**
 * Corazón de favorito (toggle optimista con rollback). El error va en el
 * `title` del botón: en filas/cards no hay espacio para texto inline.
 */
export function FavoriteButton({
  songId,
  initialFavorited,
  onMutated,
  className,
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = React.useState(initialFavorited);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    const previous = favorited;
    // Optimista: el corazón cambia apenas; si falla, se revierte.
    setFavorited(!previous);
    try {
      if (previous) await favoritesService.remove(songId);
      else await favoritesService.add(songId);
    } catch (err) {
      setFavorited(previous);
      setError(friendlyError(err));
      setPending(false);
      return;
    }
    // La Server Action (`updateTag`) ya revalida; un `router.refresh()` extra
    // provocaba un segundo flash. Va FUERA del try de la mutación: si el
    // refresco falla, el like YA se persistió y no debe revertirse.
    await onMutated?.().catch(() => undefined);
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
      title={error ?? undefined}
      className={cn(
        "rounded-pill p-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-50",
        favorited ? "text-brand-400" : "text-text-subdued hover:text-brand-400",
        className
      )}
    >
      <Heart size={18} fill={favorited ? "currentColor" : "none"} />
    </button>
  );
}
