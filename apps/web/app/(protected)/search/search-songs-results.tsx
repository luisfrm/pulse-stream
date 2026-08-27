"use client";

import * as React from "react";

import { LoadMoreButton } from "@/components/load-more-button";
import { MediaCardSkeleton } from "@/components/loading-skeletons";
import { SongCard } from "@/components/song-card";
import { songsService } from "@/lib/services/songs-service";
import type { Page, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface SearchSongsResultsProps {
  readonly initialPage: Page<Song>;
  readonly query: string;
}

/**
 * Resultados de canciones en /search: grid paginado client-side con "Ver más".
 * Los artistas del buscador (limitados a 6) los sigue renderizando el RSC,
 * porque esa lista es chica y fija.
 */
export function SearchSongsResults({
  initialPage,
  query,
}: SearchSongsResultsProps) {
  const [songs, setSongs] = React.useState<Song[]>(initialPage.items);
  const [total, setTotal] = React.useState<number>(initialPage.total);
  const [offset, setOffset] = React.useState<number>(initialPage.items.length);
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

  if (songs.length === 0) {
    return (
      <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
        Sin resultados para tu búsqueda.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {songs.map((song, idx) => (
          <SongCard key={song.id} song={song} queue={songs} priority={idx < 4} />
        ))}
      </div>

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

/** Skeleton espejado del estado con datos. */
export function SearchSongsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <MediaCardSkeleton key={i} />
      ))}
    </div>
  );
}
