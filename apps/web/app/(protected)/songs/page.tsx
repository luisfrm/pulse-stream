import { Suspense } from "react";
import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { SearchInput } from "@/components/search-input";
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

      {/* Input fuera del Suspense: no pierde foco al navegar y pinta inmediato (no bloqueado por library). */}
      <SearchInput
        initialValue={query}
        placeholder="Buscar canciones por título…"
      />

      <Suspense fallback={<SongsResultsSkeleton />}>
        <SongsContent query={query} />
      </Suspense>
    </div>
  );
}

async function SongsContent({ query }: { query: string }) {
  // Catálogo cacheado (revalidate:300) + biblioteca privada (no-store) en paralelo;
  // al estar dentro de Suspense, el header/input ya pintaron y solo el grid suspende.
  const [library, initialPage] = await Promise.all([
    getUserLibrary(),
    songsService.getSongs(
      { query: query || undefined, offset: 0, limit: PAGE_LIMIT },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } },
    ),
  ]);

  const refreshLibrary = async () => {
    "use server";
    updateTag(CACHE_TAGS.favorites);
    updateTag(CACHE_TAGS.playlists);
  };

  if (initialPage.items.length === 0) {
    return (
      <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
        {query
          ? "Sin resultados para tu búsqueda."
          : "Todavía no hay canciones publicadas. Volvé más tarde."}
      </p>
    );
  }

  return (
    <SongsResults
      initialPage={initialPage}
      query={query}
      playlists={library?.playlists}
      favoriteIds={library?.favoriteIds}
      onMutated={refreshLibrary}
    />
  );
}