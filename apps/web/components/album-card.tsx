import Link from "next/link";

import { cn } from "@/components/ui";
import type { Album } from "@/lib/services/types";

interface AlbumCardProps {
  album: Album;
  className?: string;
}

/** Tarjeta de álbum: cover, título y artista (mismo patrón que PlaylistCard). */
export function AlbumCard({ album, className }: AlbumCardProps) {
  return (
    <Link
      href={`/album/${album.id}`}
      className={cn(
        "card-lift group relative flex h-full flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3",
        className
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
        {album.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.cover_url}
            alt={`Cover de ${album.title}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
            <span className="font-display text-4xl font-extrabold text-bg-base">
              {album.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{album.title}</p>
        <p className="truncate text-xs text-text-subdued">
          {album.artist.name}
          {" · "}
          {album.song_count} {album.song_count === 1 ? "canción" : "canciones"}
        </p>
      </div>
    </Link>
  );
}
