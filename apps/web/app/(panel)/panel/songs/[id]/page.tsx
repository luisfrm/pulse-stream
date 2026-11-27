import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateTag } from "next/cache";

import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { genresService } from "@/lib/services/genres-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { safePanelReturnPath } from "@/lib/utils/song-upload";

import { SongManager } from "./song-manager";

interface PanelSongPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}

export const metadata: Metadata = { title: "Canción · Panel" };
export const dynamic = "force-dynamic";

export default async function PanelSongPage({ params, searchParams }: PanelSongPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const returnTo = safePanelReturnPath(query.returnTo);

  const song = await songsService
    .getSongById(id, {
      next: { revalidate: 300, tags: [CACHE_TAGS.songs] },
    })
    .catch(() => null);
  if (!song) notFound();

  const [genres, albumsPage, artistsPage] = await Promise.all([
    genresService.getGenres({
      next: { revalidate: 3600, tags: [CACHE_TAGS.genres] },
    }),
    albumsService
      .getAlbums(
        { limit: 100 },
        { next: { revalidate: 300, tags: [CACHE_TAGS.albums] } }
      )
      .catch(() => ({ items: [] })),
    artistsService
      .getArtists(
        { limit: 100 },
        { next: { revalidate: 300, tags: [CACHE_TAGS.artists] } }
      )
      .catch(() => ({ items: [] })),
  ]);

  const refresh = async () => {
    "use server";
    updateTag(CACHE_TAGS.songs);
    updateTag(CACHE_TAGS.albums);
    updateTag(CACHE_TAGS.artists);
  };

  return (
    <SongManager
      song={song}
      genres={genres}
      albums={albumsPage.items}
      artists={artistsPage.items}
      returnTo={returnTo}
      onMutated={refresh}
    />
  );
}