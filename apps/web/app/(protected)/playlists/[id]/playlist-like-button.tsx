"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import { friendlyError } from "@/lib/utils/error";

interface PlaylistLikeButtonProps {
  playlistId: string;
  initialLiked: boolean;
  onMutated: () => Promise<void>;
}

/**
 * Like de playlist (PUT/DELETE /me/favorites/playlists/{id}) con corazón
 * lleno/vacío. Se muestra en las playlists del sistema: una `system` puede
 * estar "likeada" por el usuario sin que eso mute su contenido.
 *
 * Icon-only (mismo patrón que el corazón de `FavoriteButton`): el nombre
 * accesible va en `aria-label`, el `title` da el tooltip en desktop y el error
 * solo aparece ahí (en un hero no hay espacio para texto inline).
 */
export function PlaylistLikeButton({
  playlistId,
  initialLiked,
  onMutated,
}: PlaylistLikeButtonProps) {
  const router = useRouter();
  const [liked, setLiked] = React.useState(initialLiked);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    const previous = liked;
    // Optimista: el corazón cambia apenas; si falla, se revierte.
    setLiked(!previous);
    try {
      if (previous) await favoritesService.removeFavoritePlaylist(playlistId);
      else await favoritesService.addFavoritePlaylist(playlistId);
      await onMutated();
      router.refresh();
      toast.success(previous ? "Se quitó de tu catálogo" : "Agregada a tu catálogo");
    } catch (err) {
      setLiked(previous);
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Quitar de tu catálogo" : "Guardar en tu catálogo"}
      title={error ?? (liked ? "Quitar de tu catálogo" : "Guardar en tu catálogo")}
      className={cn(
        "rounded-pill p-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-50",
        liked ? "text-brand-400" : "text-text-subdued hover:text-brand-400"
      )}
    >
      <Heart size={18} fill={liked ? "currentColor" : "none"} />
    </button>
  );
}