import { Suspense } from "react";
import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { ArtistCard } from "@/components/artist-card";
import { Carousel } from "@/components/carousel";
import {
  CarouselSkeleton,
  SongItemSkeleton,
} from "@/components/loading-skeletons";
import { MediaCard } from "@/components/media-card";
import { SearchInput } from "@/components/search-input";
import { Section } from "@/components/section";
import { Skeleton } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { getUserLibrary } from "@/lib/services/library";
import { playlistsService } from "@/lib/services/playlists-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import type { Album, Playlist } from "@/lib/services/types";
import { authorHandle } from "@/lib/utils/format";

import { SearchSongsResults } from "./search-songs-results";

export const metadata: Metadata = { title: "Explorar" };
export const dynamic = "force-dynamic";

const ARTIST_LIMIT = 12;
/** Cada fuente de "Incluye" se pide con este tope; el merge se corta en MIX_TOTAL. */
const MIX_LIMIT = 6;
const MIX_TOTAL = 12;
const SONGS_LIMIT = 24;

/** Item de carrusel de artista: card cuadrada chiquita (no circular). */
const ARTIST_ITEM = "w-[150px] shrink-0 snap-start sm:w-[168px]";
/** Item de la shelf "Incluye": cover de ~150px, estilo Spotify. */
const SHELF_ITEM = "w-[140px] shrink-0 snap-start sm:w-[156px]";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  // Param repetido (`?q=a&q=b`): se toma el primero, como en el resto de la app.
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Explorar
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Buscá artistas, álbumes, playlists y canciones. Las canciones se
          ordenan por reproducciones.
        </p>
      </header>

      {/* El input vive FUERA de los boundaries: al navegar no pierde el foco ni
          lo tipeado; cada sección re-suspende con su propio skeleton. */}
      <SearchInput
        initialValue={query}
        placeholder="Artistas, álbumes, playlists o canciones…"
      />

      {query ? (
        <div className="flex flex-col gap-10">
          <Suspense fallback={<CarouselSkeleton title="Artistas" />}>
            <ArtistsSection query={query} />
          </Suspense>

          <Suspense
            fallback={<CarouselSkeleton title={`Incluye "${query}"`} />}
          >
            <IncludesSection query={query} />
          </Suspense>

          <Suspense fallback={<SongsSectionSkeleton />}>
            <SongsSection query={query} />
          </Suspense>
        </div>
      ) : (
        <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
          Escribí algo para empezar a explorar…
        </p>
      )}
    </div>
  );
}

/** Sección 1: artistas que matchean, card cuadrada chiquita. */
async function ArtistsSection({ query }: { query: string }) {
  const { items } = await artistsService.getArtists(
    { query, limit: ARTIST_LIMIT },
    { next: { revalidate: 300, tags: [CACHE_TAGS.artists] } },
  );

  if (items.length === 0) return null;

  return (
    <Section title="Artistas">
      <Carousel>
        {items.map((artist, index) => (
          <div key={artist.id} className={ARTIST_ITEM}>
            <ArtistCard artist={artist} priority={index < 4} />
          </div>
        ))}
      </Carousel>
    </Section>
  );
}

type MixedItem =
  | { kind: "album"; album: Album }
  | { kind: "playlist"; playlist: Playlist };

/** Sección 2: álbumes + playlists que incluyen la búsqueda en el nombre. */
async function IncludesSection({ query }: { query: string }) {
  const [albums, playlists] = await Promise.all([
    albumsService.getAlbums(
      { query, limit: MIX_LIMIT },
      { next: { revalidate: 300, tags: [CACHE_TAGS.albums] } },
    ),
    playlistsService.getPublicPlaylists(
      { q: query, limit: MIX_LIMIT },
      { next: { revalidate: 300, tags: [CACHE_TAGS.playlists] } },
    ),
  ]);

  const mixed = shuffle<MixedItem>([
    ...albums.items.map((album) => ({ kind: "album" as const, album })),
    ...playlists.items.map((playlist) => ({
      kind: "playlist" as const,
      playlist,
    })),
  ]).slice(0, MIX_TOTAL);

  if (mixed.length === 0) return null;

  return (
    <Section title={`Incluye "${query}"`}>
      <Carousel>
        {mixed.map((item) =>
          item.kind === "album" ? (
            <div key={`album-${item.album.id}`} className={SHELF_ITEM}>
              <MediaCard
                title={item.album.title}
                href={`/album/${item.album.id}`}
                coverUrl={item.album.cover_url}
                subtitle={`${item.album.artist.name} · Álbum`}
              />
            </div>
          ) : (
            <div key={`playlist-${item.playlist.id}`} className={SHELF_ITEM}>
              <MediaCard
                title={item.playlist.name}
                href={`/playlists/${item.playlist.id}`}
                coverUrl={item.playlist.cover_url}
                subtitle={`Lista de ${authorHandle(item.playlist.owner_email)}`}
              />
            </div>
          ),
        )}
      </Carousel>
    </Section>
  );
}

/** Sección 3: canciones (título o artista), más reproducidas primero. */
async function SongsSection({ query }: { query: string }) {
  // Catálogo cacheado por tag + biblioteca privada (no-store) en paralelo.
  const [library, initialPage] = await Promise.all([
    getUserLibrary(),
    songsService.getSongs(
      { query, offset: 0, limit: SONGS_LIMIT, sort: "plays" },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } },
    ),
  ]);

  const refreshLibrary = async () => {
    "use server";
    updateTag(CACHE_TAGS.favorites);
    updateTag(CACHE_TAGS.playlists);
  };

  return (
    <Section title="Canciones">
      {initialPage.items.length === 0 ? (
        <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
          Sin canciones para “{query}”.
        </p>
      ) : (
        <SearchSongsResults
          key={query}
          initialPage={initialPage}
          query={query}
          playlists={library?.playlists}
          favoriteIds={library?.favoriteIds}
          onMutated={refreshLibrary}
        />
      )}
    </Section>
  );
}

function SongsSectionSkeleton() {
  return (
    <section>
      <Skeleton className="mb-4 h-7 w-40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <SongItemSkeleton key={index} />
        ))}
      </div>
    </section>
  );
}

/**
 * Fisher-Yates sobre el merge ya armado.
 *
 * La página es `force-dynamic`: el orden cambia en cada request, mientras los
 * fetch de álbumes/playlists siguen cacheados por tag (revalidate: 300). Se
 * mezcla en el RSC a propósito: nada de esto viaja al cliente.
 */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
