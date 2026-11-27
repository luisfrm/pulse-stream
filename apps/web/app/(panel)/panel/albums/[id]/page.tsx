import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateTag } from "next/cache";

import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { genresService } from "@/lib/services/genres-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { AlbumManager } from "./album-manager";

interface PanelAlbumPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Álbum · Panel" };
export const dynamic = "force-dynamic";

export default async function PanelAlbumPage({ params }: PanelAlbumPageProps) {
  const { id } = await params;
  const [album, genres, artistsPage] = await Promise.all([
    albumsService
      .getAlbumById(id, {
        next: { revalidate: 300, tags: [CACHE_TAGS.albums] },
      })
      .catch(() => null),
    genresService
      .getGenres({
        next: { revalidate: 3600, tags: [CACHE_TAGS.genres] },
      })
      .catch(() => []),
    artistsService
      .getArtists(
        { limit: 100 },
        { next: { revalidate: 300, tags: [CACHE_TAGS.artists] } }
      )
      .catch(() => ({ items: [] })),
  ]);
  if (!album) notFound();

  const refresh = async () => {
    "use server";
    updateTag(CACHE_TAGS.albums);
    updateTag(CACHE_TAGS.songs);
  };

  return (
    <AlbumManager
      album={album}
      genres={genres}
      artists={artistsPage.items}
      onMutated={refresh}
    />
  );
}