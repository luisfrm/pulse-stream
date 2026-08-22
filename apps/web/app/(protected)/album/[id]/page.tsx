import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { albumsService } from "@/lib/services/albums-service";
import { getUserLibrary } from "@/lib/services/library";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { AlbumSongs } from "./album-songs";

interface AlbumPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: AlbumPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const album = await albumsService.getAlbumById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.albums] },
    });
    return { title: `${album.title} — ${album.artist.name}` };
  } catch {
    return { title: "Álbum" };
  }
}

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { id } = await params;

  // Metadata del álbum + canciones paginadas + biblioteca del usuario.
  // Antes la canción se leía de `album.songs` (sin límite): si el álbum
  // tenía 100+ tracks los pintaba todos en el primer load.
  const [album, initialSongs, library] = await Promise.all([
    albumsService
      .getAlbumById(id, {
        next: { revalidate: 60, tags: [CACHE_TAGS.albums] },
      })
      .catch(() => null),
    songsService
      .getSongs(
        { albumId: id, offset: 0, limit: PAGE_LIMIT },
        // Las canciones del álbum se cachean junto al catálogo público: misma
        // key que `/songs` (catalog:songs).
        { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
      )
      .catch(() => ({ items: [], total: 0, offset: 0, limit: PAGE_LIMIT })),
    getUserLibrary(),
  ]);

  if (!album) notFound();

  const songCount = initialSongs.total;

  return (
    <div className="flex flex-col gap-8">
      <BackLink
        href={album.artist ? `/artist/${album.artist.id}` : "/songs"}
      />
      <section className="border-b border-bg-highlight bg-bg-elevated/60 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 sm:flex-row sm:items-end">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight shadow-lg sm:h-52 sm:w-52">
            {album.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={album.cover_url}
                alt={`Cover de ${album.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
                <span className="font-display text-6xl font-extrabold text-bg-base">
                  {album.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-subdued">
              Álbum
            </p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight sm:text-5xl">
              {album.title}
            </h1>
            <Link
              href={`/artist/${album.artist.id}`}
              className="mt-2 block text-lg text-brand-400 hover:underline"
            >
              {album.artist.name}
            </Link>
            <p className="mt-1 text-sm text-text-subdued">
              {songCount} {songCount === 1 ? "canción" : "canciones"}
            </p>
          </div>
        </div>
      </section>

      <AlbumSongs
        albumId={id}
        initialPage={initialSongs}
        library={library}
      />
    </div>
  );
}
