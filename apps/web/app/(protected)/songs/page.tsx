import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { SearchInput } from "@/components/search-input";
import { Skeleton } from "@/components/ui";
import { getUserLibrary } from "@/lib/services/library";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { SongsResults, SongsResultsSkeleton } from "./songs-results";

export const metadata: Metadata = { title: "Canciones" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 24;

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  // Sesión + catálogo cacheado por tags, en paralelo. La primera página llega
  // al cliente con Ver más: si hay 10k canciones, no las bajamos todas.
  const [library, initialPage] = await Promise.all([
    getUserLibrary(),
    songsService.getSongs(
      { query: query || undefined, offset: 0, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
    ),
  ]);

  // Server Action: purga tags tras una mutación (like/playlist/descarga).
  const refreshLibrary = async () => {
    "use server";
    updateTag(CACHE_TAGS.favorites);
    updateTag(CACHE_TAGS.playlists);
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Canciones
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Explorá todo el catálogo de Pulse Stream. Guardá, sumá a playlists o
          descargá para escuchar offline.
        </p>
      </header>

      <SearchInput
        initialValue={query}
        placeholder="Buscar canciones por título…"
      />

      {initialPage.items.length === 0 ? (
        <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
          {query
            ? "Sin resultados para tu búsqueda."
            : "Todavía no hay canciones publicadas. Volvé más tarde."}
        </p>
      ) : (
        <SongsResults
          initialPage={initialPage}
          query={query}
          playlists={library?.playlists}
          favoriteIds={library?.favoriteIds}
          onMutated={refreshLibrary}
        />
      )}
    </div>
  );
}