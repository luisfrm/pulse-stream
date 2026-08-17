import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";

import { Card, CardContent, Title } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { CreatePlaylistForm } from "./create-playlist-form";

export const metadata: Metadata = { title: "Playlists" };
export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const playlists = await playlistsService.getMyPlaylists();

  const refreshPlaylists = async () => {
    "use server";
    updateTag(CACHE_TAGS.playlists);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Title as="h1" size="section">
            Playlists
          </Title>
          <p className="mt-2 text-sm text-text-subdued">
            Tus listas de canciones, armadas a mano.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {playlists.map((pl) => (
          <Link key={pl.id} href={`/dashboard/playlists/${pl.id}`}>
            <Card className="h-full transition-colors hover:border-brand-400">
              <CardContent className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
                  {pl.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pl.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                      {pl.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display font-bold">{pl.name}</p>
                  <p className="text-xs text-text-subdued">
                    {pl.song_count} {pl.song_count === 1 ? "canción" : "canciones"}
                    {pl.is_public ? " · pública" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        <CreatePlaylistForm onCreated={refreshPlaylists} />
      </div>
    </div>
  );
}
