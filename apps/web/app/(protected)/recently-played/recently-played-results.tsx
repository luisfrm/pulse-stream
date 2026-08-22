"use client";

import * as React from "react";
import Link from "next/link";

import { LoadMoreButton } from "@/components/load-more-button";
import { SongCard } from "@/components/song-card";
import { SongItemSkeleton } from "@/components/loading-skeletons";
import { listensService } from "@/lib/services/listens-service";
import type { Page, RecentlyPlayedSong } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface RecentlyPlayedResultsProps {
  readonly initialPage: Page<RecentlyPlayedSong>;
}

/**
 * Historial de escuchas recientes: grid paginado client-side con "Ver más".
 * Sin paginación por URL — `SongCard` reproduce la cola de lo cargado.
 */
export function RecentlyPlayedResults({
  initialPage,
}: RecentlyPlayedResultsProps) {
  const [songs, setSongs] = React.useState<RecentlyPlayedSong[]>(initialPage.items);
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
      const page = await listensService.getRecentlyPlayed({
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
      <div className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-12 text-center">
        <p className="font-display text-lg">Todavía no escuchaste nada.</p>
        <p className="mt-1 text-sm text-text-subdued">
          Reproducí alguna canción y va a aparecer acá.
        </p>
        <Link
          href="/search"
          className="mt-5 inline-block rounded-pill bg-brand-400 px-6 py-2.5 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
        >
          Buscar canciones
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {songs.map((song) => (
          <SongCard
            key={song.id}
            song={song}
            queue={songs as never}
            badge={
              (song.user_play_count ?? 0) > 1
                ? `${song.user_play_count}×`
                : undefined
            }
          />
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

/** Skeleton del estado con datos (mismo patrón que el resto del módulo). */
export function RecentlyPlayedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <SongItemSkeleton key={i} />
      ))}
    </div>
  );
}
