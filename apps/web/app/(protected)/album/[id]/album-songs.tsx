"use client";

import * as React from "react";

import { LoadMoreButton } from "@/components/load-more-button";
import { SongItem } from "@/components/song-item";
import { songsService } from "@/lib/services/songs-service";
import type { MyPlaylist, Page, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface AlbumSongsProps {
  readonly albumId: string;
  readonly initialPage: Page<Song>;
  readonly library: { favoriteIds: Set<string>; playlists: MyPlaylist[] } | null;
  readonly onMutated?: () => Promise<void>;
}

const PAGE_LIMIT = 20;

/**
 * Canciones de un álbum con paginación client-side. Antes el RSC bajaba
 * todas las canciones en un solo request (`getAlbumById` → `album.songs`):
 * si un álbum tenía 100+ tracks, los pintaba todos sin acotar.
 */
export function AlbumSongs({
  albumId,
  initialPage,
  library,
  onMutated,
}: AlbumSongsProps) {
  const [items, setItems] = React.useState<Song[]>(initialPage.items);
  const [total, setTotal] = React.useState<number>(initialPage.total);
  const [offset, setOffset] = React.useState<number>(initialPage.items.length);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasMore = items.length < total;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await songsService.getSongs({
        albumId,
        offset,
        limit: PAGE_LIMIT,
      });
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      setOffset((prev) => prev + page.items.length);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-text-subdued">
        Este álbum todavía no tiene canciones.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2.5">
        {items.map((song) => (
          <SongItem
            key={song.id}
            song={song}
            queue={items}
            favoriteIds={library?.favoriteIds}
            playlists={library?.playlists}
            onMutated={onMutated}
          />
        ))}
      </ul>
      <LoadMoreButton onClick={loadMore} loading={loadingMore} hasMore={hasMore} />
      {error && (
        <p className="mt-2 rounded-xl bg-brand-900/30 px-3.5 py-2.5 text-center text-sm text-brand-200">
          {error}
        </p>
      )}
    </>
  );
}
