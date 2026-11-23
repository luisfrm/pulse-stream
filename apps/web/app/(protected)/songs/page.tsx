import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { updateTag } from "next/cache";
import { X } from "lucide-react";

import { SearchInput } from "@/components/search-input";
import { genresService } from "@/lib/services/genres-service";
import { getUserLibrary } from "@/lib/services/library";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { formatGenre } from "@/lib/utils/format";

import { SongsResults, SongsResultsSkeleton } from "./songs-results";

export const metadata: Metadata = { title: "Canciones" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 24;

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; genre?: string | string[] }>;
}) {
  const params = await searchParams;
  // `q` repetido en la URL (`?q=a&q=b`) llega como array: se toma el primero,
  // igual que `genre` (un array acá rompería `trim` y tiraría el error boundary).
  const rawQuery = params.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";

  // `genre` llega de los links de la landing. Se valida contra la lista real
  // (cacheada por tag) antes de pasarlo: un valor inventado haría 422 en la API
  // y rompería el RSC; así un link viejo simplemente cae al listado completo.
  const rawGenre = params.genre;
  const requestedGenre =
    (Array.isArray(rawGenre) ? rawGenre[0] : rawGenre)?.trim() ?? "";
  const genres = requestedGenre
    ? await genresService
        .getGenres({ next: { revalidate: 300, tags: [CACHE_TAGS.genres] } })
        .catch(() => [])
    : [];
  const genre = genres.includes(requestedGenre) ? requestedGenre : "";

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

      {/* Input fuera del Suspense (no pierde foco) + chip del filtro activo;
          `SearchInput` mergea sobre los params actuales, así `genre` sobrevive
          a cada búsqueda. */}
      <div className="flex flex-col gap-3">
        <SearchInput
          initialValue={query}
          placeholder="Buscar canciones por título…"
        />

        {genre && (
          <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-brand-600/50 bg-brand-900/30 py-1 pl-3 pr-2 text-sm text-brand-200">
            Género: {formatGenre(genre)}
            <Link
              href={query ? `/songs?q=${encodeURIComponent(query)}` : "/songs"}
              aria-label={`Quitar el filtro de ${formatGenre(genre)}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-brand-200 transition-colors hover:bg-brand-900/60 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
            >
              <X size={14} aria-hidden />
            </Link>
          </span>
        )}
      </div>

      <Suspense fallback={<SongsResultsSkeleton />}>
        <SongsContent query={query} genre={genre} />
      </Suspense>
    </div>
  );
}

async function SongsContent({ query, genre }: { query: string; genre: string }) {
  // Catálogo cacheado (revalidate:300) + biblioteca privada (no-store) en paralelo;
  // al estar dentro de Suspense, el header/input ya pintaron y solo el grid suspende.
  const [library, initialPage] = await Promise.all([
    getUserLibrary(),
    songsService.getSongs(
      {
        query: query || undefined,
        offset: 0,
        limit: PAGE_LIMIT,
        ...(genre ? { genre } : {}),
      },
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
        {genre
          ? `No hay canciones de ${formatGenre(genre)} que coincidan con tu búsqueda.`
          : query
            ? "Sin resultados para tu búsqueda."
            : "Todavía no hay canciones publicadas. Volvé más tarde."}
      </p>
    );
  }

  return (
    <SongsResults
      key={`${query}:${genre}`}
      initialPage={initialPage}
      query={query}
      genre={genre}
      playlists={library?.playlists}
      favoriteIds={library?.favoriteIds}
      onMutated={refreshLibrary}
    />
  );
}