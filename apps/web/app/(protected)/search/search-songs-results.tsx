"use client";

import * as React from "react";

import { LoadMoreButton } from "@/components/load-more-button";
import { searchContext } from "@/components/player/play-contexts";
import { SongItem } from "@/components/song-item";
import { songsService } from "@/lib/services/songs-service";
import type { MyPlaylist, Page, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface SearchSongsResultsProps {
  readonly initialPage: Page<Song>;
  readonly query: string;
  /** Datos del usuario para que las filas tengan corazón / "+" / descarga. */
  readonly playlists?: MyPlaylist[];
  readonly favoriteIds?: Set<string>;
  /** Server Action a invocar después de una mutación (like/playlist). */
  readonly onMutated?: () => Promise<void>;
}

/**
 * Resultados de canciones de /search: FILAS compactas (SongItem) paginadas
 * client-side con "Ver más". La primera página la trae el RSC ya ordenada por
 * `sort=plays`; las siguientes repiten ese mismo orden (si no, el offset/limit
 * avanzaría sobre otro orden y se saltearían o repetirían canciones).
 */
export function SearchSongsResults({
  initialPage,
  query,
  playlists,
  favoriteIds,
  onMutated,
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
        query,
        offset,
        limit: initialPage.limit,
        sort: "plays",
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

  // Un solo descriptor por render: todas las filas comparten el contexto
  // (la semilla se actualiza con cada "Ver más").
  const context = searchContext({ query, seed: songs, total });

  return (
    <>
      <ul className="flex flex-col gap-2">
        {songs.map((song) => (
          <SongItem
            key={song.id}
            song={song}
            context={context}
            playlists={playlists}
            favoriteIds={favoriteIds}
            onMutated={onMutated}
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
