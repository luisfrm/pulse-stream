import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { artistsService } from "@/lib/services/artists-service";
import { sessionService } from "@/lib/services/session-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { ArtistsResults } from "./artists-results";

export const metadata: Metadata = { title: "Artistas" };

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  // En Next 15/16 searchParams es una Promise
  const params = await searchParams;
  const query = params.q ?? "";
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  // Sesión para decidir la UI (los datos del catálogo son públicos)
  const user = await sessionService.getSession();
  const isAdmin = Boolean(
    user && (user.is_superuser || user.role === "admin")
  );

  // Lectura cacheada con tags (catálogo público y compartido)
  const { items, total } = await artistsService.getArtists(
    { query: query || undefined, offset, limit: PAGE_LIMIT },
    { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } },
  );

  // Server Action: purga el tag bajo demanda (después de mutar)
  const refreshArtists = async () => {
    "use server";
    updateTag(CACHE_TAGS.artists);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Artistas</h1>

      <div className="mt-6 flex max-w-md items-center gap-3">
        <SearchInput
          initialValue={query}
          placeholder="Buscar artistas…"
        />
      </div>

      <ArtistsResults
        initialArtists={items}
        initialQuery={query}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_LIMIT))}
        limit={PAGE_LIMIT}
        isAdmin={isAdmin}
        onRevalidate={refreshArtists}
      />

      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_LIMIT))}
        limit={PAGE_LIMIT}
      />
    </div>
  );
}
