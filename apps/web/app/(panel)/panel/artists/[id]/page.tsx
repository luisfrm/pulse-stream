import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateTag } from "next/cache";

import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { ArtistManager } from "./artist-manager";

interface PanelArtistPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Artista · Panel" };
export const dynamic = "force-dynamic";

export default async function PanelArtistPage({ params }: PanelArtistPageProps) {
  const { id } = await params;

  const artist = await artistsService
    .getArtistById(id, {
      next: { revalidate: 300, tags: [CACHE_TAGS.artists] },
    })
    .catch(() => null);
  if (!artist) notFound();

  const [{ items: albums }, { items: songs }, { items: collaborations }] =
    await Promise.all([
      albumsService
        .getAlbums(
          { artistId: id, limit: 100 },
          { next: { revalidate: 300, tags: [CACHE_TAGS.albums] } }
        )
        .catch(() => ({ items: [] })),
      // Ojo: la API limita `limit` a 100 (`le=100` en /songs) — más de eso
      // responde 422 y el catch dejaría la lista vacía.
      songsService
        .getSongs(
          { artistId: id, limit: 100 },
          { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
        )
        .catch(() => ({ items: [] })),
      songsService
        .getSongs(
          { collaboratorId: id, limit: 100 },
          { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
        )
        .catch(() => ({ items: [] })),
    ]);

  const refresh = async () => {
    "use server";
    updateTag(CACHE_TAGS.artists);
    updateTag(CACHE_TAGS.albums);
    updateTag(CACHE_TAGS.songs);
  };

  return (
    <ArtistManager
      artist={artist}
      albums={albums}
      songs={songs}
      collaborations={collaborations}
      onMutated={refresh}
    />
  );
}