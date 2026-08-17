import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { artistsService } from "@/lib/services/artists-service";
import { genresService } from "@/lib/services/genres-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { NewSongForm } from "./new-song-form";

export const metadata: Metadata = { title: "Subir canción" };

export const dynamic = "force-dynamic";

export default async function NewSongPage() {
  // Lecturas en paralelo en el servidor: cero waterfalls
  const [artistsPage, genres] = await Promise.all([
    artistsService.getArtists(undefined, {
      next: { revalidate: 60, tags: [CACHE_TAGS.artists] },
    }),
    genresService.getGenres({
      next: { revalidate: 3600, tags: [CACHE_TAGS.genres] },
    }),
  ]);

  // Al crear una canción con artista inline también cambia el catálogo de
  // artistas: purgamos ambos tags.
  const refreshCatalog = async () => {
    "use server";
    updateTag(CACHE_TAGS.songs);
    updateTag(CACHE_TAGS.artists);
  };

  return (
    <NewSongForm
      initialArtists={artistsPage.items}
      initialGenres={genres}
      onCreated={refreshCatalog}
    />
  );
}
