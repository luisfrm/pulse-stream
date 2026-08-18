import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { genresService } from "@/lib/services/genres-service";
import { getSession } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { SongsResults } from "./songs-results";

export const metadata: Metadata = { title: "Canciones" };

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 9;

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  const [user, songsPage, genres, albumsPage, artistsPage] = await Promise.all([
    getSession(),
    songsService.getSongs(
      { query: query || undefined, offset, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
    ),
    genresService.getGenres({
      next: { revalidate: 3600, tags: [CACHE_TAGS.genres] },
    }),
    albumsService.getAlbums(
      { limit: 100 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.albums] } }
    ),
    artistsService.getArtists(
      { limit: 100 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } }
    ),
  ]);

  const isAdmin = Boolean(
    user && (user.is_superuser || user.role === "admin")
  );

  const refreshSongs = async () => {
    "use server";
    updateTag(CACHE_TAGS.songs);
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Canciones</h1>
          <p className="mt-1 text-sm text-text-subdued">
            Grid del catálogo: reproducí un preview, editá metadatos y cover, o
            eliminá canciones.
          </p>
        </div>
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
        initialSongs={songsPage.items}
        initialQuery={query}
        page={page}
        totalPages={Math.max(1, Math.ceil(songsPage.total / PAGE_LIMIT))}
        limit={PAGE_LIMIT}
        isAdmin={isAdmin}
        genres={genres}
        albums={albumsPage.items}
        artists={artistsPage.items}
        onRevalidate={refreshSongs}
      />

      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(songsPage.total / PAGE_LIMIT))}
        limit={PAGE_LIMIT}
      />
    </div>
  );
}
