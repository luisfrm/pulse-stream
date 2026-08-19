"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui";
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
    <div className="flex flex-col gap-1">
      <Button
        variant={liked ? "primary" : "outline"}
        onClick={toggle}
        loading={pending}
        aria-pressed={liked}
        aria-label={liked ? "Quitar de tu catálogo" : "Guardar en tu catálogo"}
        title={error ?? undefined}
      >
        <Heart size={16} fill={liked ? "currentColor" : "none"} />
        {liked ? "En tu catálogo" : "Guardar"}
      </Button>
    </div>
  );
}
