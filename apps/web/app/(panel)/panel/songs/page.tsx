import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { sessionService } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { SongsResults } from "./songs-results";

export const metadata: Metadata = { title: "Canciones" };

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  const user = await sessionService.getSession();
  const isAdmin = Boolean(
    user && (user.is_superuser || user.role === "admin")
  );

  const { items, total } = await songsService.getSongs(
    { query: query || undefined, offset, limit: PAGE_LIMIT },
    { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
  );

  const refreshSongs = async () => {
    "use server";
    updateTag(CACHE_TAGS.songs);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Canciones</h1>
        {isAdmin && (
          <Link
            href="/panel/songs/new"
            className="rounded-pill bg-brand-400 px-5 py-2.5 font-semibold text-bg-base transition-colors hover:bg-brand-200"
          >
            + Subir canción
          </Link>
        )}
      </div>

      <div className="mt-6 flex max-w-md items-center gap-3">
        <SearchInput initialValue={query} placeholder="Buscar canciones…" />
      </div>

      <SongsResults
        initialSongs={items}
        initialQuery={query}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_LIMIT))}
        limit={PAGE_LIMIT}
        isAdmin={isAdmin}
        onRevalidate={refreshSongs}
      />

      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_LIMIT))}
        limit={PAGE_LIMIT}
      />
    </div>
  );
}
