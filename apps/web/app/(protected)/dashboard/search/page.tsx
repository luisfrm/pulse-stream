import { Suspense } from "react";
import type { Metadata } from "next";

import { MediaCardSkeleton, SongItemSkeleton } from "@/components/loading-skeletons";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { SongCard } from "@/components/song-card";
import { Skeleton } from "@/components/ui";
import { artistsService } from "@/lib/services/artists-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

export const metadata: Metadata = { title: "Buscar" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 24;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const offset = Math.max(0, Number(params.offset) || 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Buscar</h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Encontrá canciones por título, o artistas por nombre.
        </p>
      </header>

      {/* El input vive FUERA del boundary: al navegar no pierde el foco ni lo
          tipeado; solo los resultados re-suspenden y muestran el skeleton. */}
      <SearchInput
        initialValue={query}
        placeholder="Canciones, artistas…"
      />

      {query ? (
        <Suspense fallback={<SearchResultsSkeleton />}>
          <SearchResults query={query} offset={offset} />
        </Suspense>
      ) : (
        <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
          Escribí algo para empezar a buscar. Probalo con un artista o una canción.
        </p>
      )}
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <Skeleton className="mb-4 h-7 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </section>
      <section className="hidden sm:block">
        <Skeleton className="mb-4 h-7 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SongItemSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

async function SearchResults({ query, offset }: { query: string; offset: number }) {
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  const [{ items: songs, total }, { items: artists }] = await Promise.all([
    songsService.getSongs(
      { query: query || undefined, offset, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
    ),
    artistsService.getArtists(
      { query: query || undefined, limit: 6 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } }
    ),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <>
      <section>
        <h2 className="mb-4 font-display text-xl font-bold">
          Canciones para “{query}”
        </h2>
        {songs.length === 0 ? (
          <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
            Sin resultados para tu búsqueda.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} queue={songs} />
            ))}
          </div>
        )}
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} limit={PAGE_LIMIT} />
        </div>
      </section>

      {artists.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold">Artistas</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((artist) => (
              <li key={artist.id}>
                <a
                  href={`/artist/${artist.id}`}
                  className="card-lift flex items-center gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3"
                >
                  {artist.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={artist.cover_url}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-brand-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display font-extrabold text-bg-base">
                      {artist.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{artist.name}</span>
                    <span className="block text-xs text-text-subdued">Artista</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}