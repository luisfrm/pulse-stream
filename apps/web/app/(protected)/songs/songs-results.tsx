"use client";

import * as React from "react";

import { LoadMoreButton } from "@/components/load-more-button";
import { SongCard } from "@/components/song-card";
import { SongItemSkeleton } from "@/components/loading-skeletons";
import { songsService } from "@/lib/services/songs-service";
import type { MyPlaylist, Page, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface SongsResultsProps {
  readonly initialPage: Page<Song>;
  readonly query: string;
  /** Datos opcionales del usuario para que las cards tengan corazón / "+" / acciones. */
  readonly playlists?: MyPlaylist[];
  readonly favoriteIds?: Set<string>;
  /** Server Action a invocar después de una mutación (like/playlist). */
  readonly onMutated?: () => Promise<void>;
}

/**
 * Grid paginado client-side del catálogo de canciones.
 * Patrón "Ver más": arranca con la primera página del RSC y va appendeando
 * a medida que el usuario pide más (offset/limit).
 */
export function SongsResults({
  initialPage,
  query,
  playlists,
  favoriteIds,
  onMutated,
}: SongsResultsProps) {
  const [songs, setSongs] = React.useState<Song[]>(initialPage.items);
  const [total, setTotal] = React.useState<number>(initialPage.total);
  const [offset, setOffset] = React.useState<number>(
    initialPage.items.length,
  );
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasMore = songs.length < total;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await songsService.getSongs({
        query: query || undefined,
        offset,
        limit: initialPage.limit,
      });
      setSongs((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      setOffset((prev) => prev + page.items.length);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {songs.map((song, idx) => (
          <SongCard
            key={song.id}
            song={song}
            queue={songs}
            playlists={playlists}
            favoriteIds={favoriteIds}
            onMutated={onMutated}
            priority={idx < 4}
          />
        ))}
      </ul>

      <LoadMoreButton
        onClick={loadMore}
        loading={loadingMore}
        hasMore={hasMore}
        doneLabel={`${total} ${total === 1 ? "canción" : "canciones"} · llegaste al final`}
      />

      {error && (
        <p className="rounded-xl bg-brand-900/30 px-3.5 py-2.5 text-center text-sm text-brand-200">
          {error}
        </p>
      )}
    </>
  );
}

/** Skeleton usado como fallback de Suspense mientras el RSC resuelve. */
export function SongsResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <SongItemSkeleton key={i} />
      ))}
    </div>
  );
}
