import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { playlistsService } from "@/lib/services/playlists-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { PlaylistsManager } from "./playlists-manager";

export const metadata: Metadata = { title: "Playlists" };
export const dynamic = "force-dynamic";

/** Panel de playlists: genera y administra las curadas por el sistema. */
export default async function PanelPlaylistsPage() {
  const feed = await playlistsService
    .getPublicPlaylists(
      { limit: 50 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.playlists] } }
    )
    .catch(() => ({ items: [] }));
  const systemPlaylists = feed.items.filter((pl) => pl.kind === "system");

  const refreshPlaylists = async () => {
    "use server";
    updateTag(CACHE_TAGS.playlists);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Playlists del sistema</h1>
      <p className="mt-2 text-sm text-text-subdued">
        Generá listas curadas (snapshot de una query) que aparecen públicas en
        la página de playlists de todos los usuarios.
      </p>

      <PlaylistsManager
        initialPlaylists={systemPlaylists}
        onMutated={refreshPlaylists}
      />
    </div>
  );
}
