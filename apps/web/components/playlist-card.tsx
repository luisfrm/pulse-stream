import Link from "next/link";

import { cn } from "@/components/ui";
import { authorHandle } from "@/lib/utils/format";
import type { Playlist } from "@/lib/services/types";

interface PlaylistCardProps {
  playlist: Playlist;
  href: string;
  className?: string;
  /**
   * Variante compacta (secciones de biblioteca): cover chica + layout
   * horizontal con texto reducido. El grid del resto de la app no cambia.
   */
  compact?: boolean;
  priority?: boolean;
}

/** Tarjeta de playlist: cover, nombre, autor y cantidad de canciones. */
export function PlaylistCard({
  playlist,
  href,
  className,
  compact = false,
  priority = false,
}: PlaylistCardProps) {
  if (compact) {
    return (
      <Link
        href={href}
        className={cn(
          "card-lift group flex h-full items-center gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-2.5",
          className
        )}
      >
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
          {playlist.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={playlist.cover_url}
              alt={`Cover de ${playlist.name}`}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              sizes="56px"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
              <span className="font-display text-lg font-extrabold text-bg-base">
                {playlist.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{playlist.name}</p>
          <p className="truncate text-xs text-text-subdued">
            {playlist.song_count} {playlist.song_count === 1 ? "canción" : "canciones"}
          </p>
        </div>
      </Link>
    );
  }

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
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
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