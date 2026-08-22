"use client";

import * as React from "react";
import Link from "next/link";

import { LoadMoreButton } from "@/components/load-more-button";
import { SongItem } from "@/components/song-item";
import { Title } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import { songsService } from "@/lib/services/songs-service";
import type {
  Album,
  MyPlaylist,
  Page,
  Song,
} from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface ArtistDetailsProps {
  readonly artistId: string;
  readonly initialSongs: Page<Song>;
  readonly initialCollaborations: Page<Song>;
  readonly initialAlbums: Page<Album>;
  readonly library: { favoriteIds: Set<string>; playlists: MyPlaylist[] } | null;
  readonly onMutated?: () => Promise<void>;
}

const PAGE_LIMIT = 20;

/**
 * Carga y muestra las 3 listas de un artista (canciones propias, colaboraciones
 * y álbumes) con Ver más independiente en cada una. Acota el load inicial a
 * 20 elementos por lista para no pintar 150 cards en un artista con discografía
 * grande.
 */
export function ArtistDetails({
  artistId,
  initialSongs,
  initialCollaborations,
  initialAlbums,
  library,
  onMutated,
}: ArtistDetailsProps) {
  return (
    <>
      <SongsSection
        artistId={artistId}
        initial={initialSongs}
        library={library}
        onMutated={onMutated}
      />

      <CollaborationsSection
        artistId={artistId}
        initial={initialCollaborations}
        library={library}
        onMutated={onMutated}
      />

      <AlbumsSection artistId={artistId} initial={initialAlbums} />
    </>
  );
}

function SongsSection({
  artistId,
  initial,
  library,
  onMutated,
}: {
  artistId: string;
  initial: Page<Song>;
  library: ArtistDetailsProps["library"];
  onMutated?: () => Promise<void>;
}) {
  const [items, setItems] = React.useState<Song[]>(initial.items);
  const [total, setTotal] = React.useState<number>(initial.total);
  const [offset, setOffset] = React.useState<number>(initial.items.length);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasMore = items.length < total;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await songsService.getSongs({
        artistId,
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
      <section>
        <Title as="h2" size="section">
          Canciones
        </Title>
        <p className="mt-4 text-text-subdued">
          Todavía no hay canciones de este artista.
        </p>
      </section>
    );
  }

  return (
    <section>
      <Title as="h2" size="section">
        Canciones
      </Title>
      <ul className="mt-4 space-y-2.5">
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
    </section>
  );
}

function CollaborationsSection({
  artistId,
  initial,
  library,
  onMutated,
}: {
  artistId: string;
  initial: Page<Song>;
  library: ArtistDetailsProps["library"];
  onMutated?: () => Promise<void>;
}) {
  const [items, setItems] = React.useState<Song[]>(initial.items);
  const [total, setTotal] = React.useState<number>(initial.total);
  const [offset, setOffset] = React.useState<number>(initial.items.length);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasMore = items.length < total;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await songsService.getSongs({
        collaboratorId: artistId,
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

  if (items.length === 0) return null;

  return (
    <section>
      <Title as="h2" size="section">
        Colaboraciones
      </Title>
      <p className="mt-1 text-sm text-text-subdued">
        Canciones donde este artista participa como invitado.
      </p>
      <ul className="mt-4 space-y-2.5">
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
    </section>
  );
}

function AlbumsSection({
  artistId,
  initial,
}: {
  artistId: string;
  initial: Page<Album>;
}) {
  const [items, setItems] = React.useState<Album[]>(initial.items);
  const [total, setTotal] = React.useState<number>(initial.total);
  const [offset, setOffset] = React.useState<number>(initial.items.length);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasMore = items.length < total;

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await albumsService.getAlbums({
        artistId,
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

  if (items.length === 0) return null;

  return (
    <section>
      <Title as="h2" size="section">
        Álbumes
      </Title>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {items.map((album) => (
          <Link
            key={album.id}
            href={`/album/${album.id}`}
            className="card-lift group flex flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3 transition-colors hover:border-brand-400"
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
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold hover:underline">
                {album.title}
              </p>
              <p className="truncate text-xs text-text-subdued">
                {album.song_count}{" "}
                {album.song_count === 1 ? "canción" : "canciones"}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <LoadMoreButton onClick={loadMore} loading={loadingMore} hasMore={hasMore} />
      {error && (
        <p className="mt-2 rounded-xl bg-brand-900/30 px-3.5 py-2.5 text-center text-sm text-brand-200">
          {error}
        </p>
      )}
    </section>
  );
}
