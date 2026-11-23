import { MediaCard } from "@/components/media-card";
import type { Artist } from "@/lib/services/types";

interface ArtistCardProps {
  artist: Artist;
  priority?: boolean;
}

/**
 * Card de artista del buscador: cover CUADRADA chiquita (no circular) con el
 * nombre y el label "Artista", como la card del artista en la vista "Todo" de
 * /search. Es un wrapper fino de `MediaCard`: sin `onPlay` no hay botón de
 * play, y el fallback de cover lo resuelve el propio átomo (`NoCover` square).
 */
export function ArtistCard({ artist, priority = false }: ArtistCardProps) {
  return (
    <MediaCard
      title={artist.name}
      href={`/artist/${artist.id}`}
      coverUrl={artist.cover_url}
      shape="square"
      subtitle="Artista"
      priority={priority}
    />
  );
}
