"use client";

import * as React from "react";

import { AlbumCard } from "@/components/album-card";
import { Carousel } from "@/components/carousel";
import { LoadMoreButton } from "@/components/load-more-button";
import { MediaCard } from "@/components/media-card";
import { SongItem } from "@/components/song-item";
import { Title } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import { songsService } from "@/lib/services/songs-service";
import type {
  Album,
  MyPlaylist,
  Page,
  Playlist,
  Song,
} from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";
import { authorHandle } from "@/lib/utils/format";

interface ArtistDetailsProps {
  readonly artistId: string;
  readonly artistName: string;
  /** Populares: ya viene con `sort=plays` desde el RSC. */
  readonly initialSongs: Page<Song>;
  readonly initialAlbums: Page<Album>;
  /** Playlists públicas que incluyen al artista (la Essentials viene primera). */
  readonly initialPlaylists: Playlist[];
  readonly initialCollaborations: Page<Song>;
  readonly library: { favoriteIds: Set<string>; playlists: MyPlaylist[] } | null;
  readonly onMutated?: () => Promise<void>;
}

/** Item de la shelf "Incluye a {artista}": misma silueta que /search. */
const SHELF_ITEM = "w-[140px] shrink-0 snap-start sm:w-[156px]";
/** Item del carrusel de discografía: el ancho estándar de las cards boxed. */
const ALBUM_ITEM = "w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[196px]";

/** Año en UTC: mismo valor en server y cliente (sin hydration mismatch). */
function releaseYear(createdAt: string): string {
  return String(new Date(createdAt).getUTCFullYear());
}

/**
 * Secciones de la página de artista: Discografía (carrusel) → Incluye a
 * {artista} (shelf) → Populares (filas por plays) → Colaboraciones. Cada lista
 * con "Ver más" pagina client-side.
 */
export function ArtistDetails({
  artistId,
  artistName,
  initialSongs,
  initialAlbums,
  initialPlaylists,
  initialCollaborations,
  library,
  onMutated,
}: ArtistDetailsProps) {
  return (
    <>
      <DiscographySection artistId={artistId} initial={initialAlbums} />

      <FeaturedInSection artistName={artistName} playlists={initialPlaylists} />

      <TopSongsSection
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
    </>
  );
}

/**
 * Populares: filas con acciones, ordenadas por `play_count`. El `sort` se repite
 * en cada "Ver más": si cambiara entre páginas, el offset avanzaría sobre otro
 * orden y se saltearían o repetirían canciones.
 */
function TopSongsSection({
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
        limit: initial.limit,
        sort: "plays",
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
          Populares
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
        Populares
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

/** Discografía: `AlbumCard` (el átomo) en carrusel, subtítulo "N canciones · año". */
function DiscographySection({
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
        limit: initial.limit,
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
        Discografía
      </Title>
      <Carousel className="mt-4">
        {items.map((album, index) => (
          <div key={album.id} className={ALBUM_ITEM}>
            <AlbumCard
              album={album}
              priority={index < 4}
              subtitle={`${album.song_count} ${
                album.song_count === 1 ? "canción" : "canciones"
              } · ${releaseYear(album.created_at)}`}
            />
          </div>
        ))}
      </Carousel>
      {/* Sin mensaje final: con pocos álbumes la página inicial ya trae todo
          y "No hay más resultados" debajo del carrusel es ruido. */}
      <LoadMoreButton
        onClick={loadMore}
        loading={loadingMore}
        hasMore={hasMore}
        doneLabel={null}
      />
      {error && (
        <p className="mt-2 rounded-xl bg-brand-900/30 px-3.5 py-2.5 text-center text-sm text-brand-200">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * "Incluye a {artista}": playlists cuyo CONTENIDO lo incluye. La primera suele
 * ser la Essentials (system primero). Sin "Ver más": las 10 llegan del RSC.
 */
function FeaturedInSection({
  artistName,
  playlists,
}: {
  artistName: string;
  playlists: Playlist[];
}) {
  if (playlists.length === 0) return null;

  return (
    <section>
      <Title as="h2" size="section">
        Incluye a {artistName}
      </Title>
      <Carousel className="mt-4">
        {playlists.map((playlist) => (
          <div key={playlist.id} className={SHELF_ITEM}>
            <MediaCard
              title={playlist.name}
              href={`/playlists/${playlist.id}`}
              coverUrl={playlist.cover_url}
              subtitle={
                playlist.kind === "system"
                  ? "Curada por Pulse Stream"
                  : `Lista de ${authorHandle(playlist.owner_email)}`
              }
            />
          </div>
        ))}
      </Carousel>
    </section>
  );
}

/** Colaboraciones: canciones donde el artista participa como invitado. */
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
        limit: initial.limit,
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
