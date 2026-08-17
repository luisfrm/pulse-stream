import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { AlbumsManager } from "./albums-manager";

export const metadata: Metadata = { title: "Álbumes" };
export const dynamic = "force-dynamic";

export default async function AlbumsPage() {
  const [albumsPage, artistsPage] = await Promise.all([
    albumsService.getAlbums(
      { limit: 50 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.albums] } }
    ),
    artistsService.getArtists(
      { limit: 100 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } }
    ),
  ]);

  const refreshAlbums = async () => {
    "use server";
    updateTag(CACHE_TAGS.albums);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Álbumes</h1>
      <p className="mt-2 text-sm text-text-subdued">
        Agrupá canciones en álbumes. Cada álbum pertenece a un artista y puede
        tener su propio cover.
      </p>

      <AlbumsManager
        initialAlbums={albumsPage.items}
        initialArtists={artistsPage.items}
        onMutated={refreshAlbums}
      />
    </div>
  );
}
