import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { getUserLibrary } from "@/lib/services/library";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { ArtistDetails } from "./artist-details";

interface ArtistPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ArtistPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const artist = await artistsService.getArtistById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.artists] },
    });
    return { title: artist.name };
  } catch {
    return { title: "Artista" };
  }
}

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { id } = await params;

  // Lecturas en paralelo: artista + canciones + colaboraciones + álbumes.
  // Cada lista arranca con PAGE_LIMIT (no 50) para no pintar 150 cards en
  // artistas grandes; el resto se appendea con "Ver más" en el cliente.
  const artist = await artistsService
    .getArtistById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.artists] },
    })
    .catch(() => null);
  if (!artist) notFound();

  const [initialSongs, initialCollaborations, initialAlbums, library] =
    await Promise.all([
      songsService
        .getSongs(
          { artistId: id, offset: 0, limit: PAGE_LIMIT },
          { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
        )
        .catch(() => ({ items: [], total: 0, offset: 0, limit: PAGE_LIMIT })),
      songsService
        .getSongs(
          { collaboratorId: id, offset: 0, limit: PAGE_LIMIT },
          { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
        )
        .catch(() => ({ items: [], total: 0, offset: 0, limit: PAGE_LIMIT })),
      albumsService
        .getAlbums(
          { artistId: id, offset: 0, limit: PAGE_LIMIT },
          { next: { revalidate: 60, tags: [CACHE_TAGS.albums] } },
        )
        .catch(() => ({ items: [], total: 0, offset: 0, limit: PAGE_LIMIT })),
      getUserLibrary(),
    ]);

  const totalSongs = initialSongs.total + initialCollaborations.total;

  return (
    <div className="flex flex-col gap-10">
      <BackLink href="/songs" />
      <section className="bg-brand-gradient -mx-4 px-6 py-12 text-bg-base lg:-mx-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
            Artista
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl">
            {artist.name}
          </h1>
          <p className="mt-3 text-bg-base/80">
            {totalSongs} {totalSongs === 1 ? "canción" : "canciones"} en el
            catálogo
            {initialAlbums.total > 0 &&
              ` · ${initialAlbums.total} ${initialAlbums.total === 1 ? "álbum" : "álbumes"}`}
          </p>
        </div>
      </section>

      <div className="space-y-10">
        <ArtistDetails
          artistId={id}
          initialSongs={initialSongs}
          initialCollaborations={initialCollaborations}
          initialAlbums={initialAlbums}
          library={library}
        />
      </div>
    </div>
  );
}
