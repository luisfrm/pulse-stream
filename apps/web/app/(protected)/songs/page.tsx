import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { SongCard } from "@/components/song-card";
import { getUserLibrary } from "@/lib/services/library";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

export const metadata: Metadata = { title: "Canciones" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 24;

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  // Sesión (para acciones) + catálogo cacheado por tags, en paralelo.
  const [library, { items: songs, total }] = await Promise.all([
    getUserLibrary(),
    songsService.getSongs(
      { query: query || undefined, offset, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
    ),
  ]);

  // Server Action: purga tags tras una mutación (like/playlist/descarga).
  const refreshLibrary = async () => {
    "use server";
    updateTag(CACHE_TAGS.favorites);
    updateTag(CACHE_TAGS.playlists);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

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

      {songs.length === 0 ? (
        <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
          {query
            ? "Sin resultados para tu búsqueda."
            : "Todavía no hay canciones publicadas. Volvé más tarde."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {songs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                queue={songs}
                playlists={library?.playlists}
                favoriteIds={library?.favoriteIds}
                onMutated={refreshLibrary}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} limit={PAGE_LIMIT} />
        </>
      )}
    </div>
  );
}