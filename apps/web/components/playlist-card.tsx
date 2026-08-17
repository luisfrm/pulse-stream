import Link from "next/link";

import { cn } from "@/components/ui";
import { authorHandle } from "@/lib/utils/format";
import type { Playlist } from "@/lib/services/types";

interface PlaylistCardProps {
  playlist: Playlist;
  href: string;
  className?: string;
}

/** Tarjeta de playlist: cover, nombre, autor y cantidad de canciones. */
export function PlaylistCard({ playlist, href, className }: PlaylistCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "card-lift group relative flex h-full flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3",
        className
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
        {playlist.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playlist.cover_url}
            alt={`Cover de ${playlist.name}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
            <span className="font-display text-4xl font-extrabold text-bg-base">
              {playlist.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{playlist.name}</p>
        <p className="truncate text-xs text-text-subdued">
          de {authorHandle(playlist.owner_email)}
          {" · "}
          {playlist.song_count} {playlist.song_count === 1 ? "canción" : "canciones"}
        </p>
      </div>
    </Link>
  );
}