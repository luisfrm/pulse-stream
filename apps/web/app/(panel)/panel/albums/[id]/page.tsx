import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateTag } from "next/cache";

import { albumsService } from "@/lib/services/albums-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { AlbumManager } from "./album-manager";

interface PanelAlbumPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Álbum · Panel" };
export const dynamic = "force-dynamic";

export default async function PanelAlbumPage({ params }: PanelAlbumPageProps) {
  const { id } = await params;
  const album = await albumsService
    .getAlbumById(id, {
      next: { revalidate: 300, tags: [CACHE_TAGS.albums] },
    })
    .catch(() => null);
  if (!album) notFound();

  const refresh = async () => {
    "use server";
    updateTag(CACHE_TAGS.albums);
    updateTag(CACHE_TAGS.songs);
  };

  return <AlbumManager album={album} onMutated={refresh} />;
}