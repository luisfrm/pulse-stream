import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Card, CardContent, Title } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { CreatePlaylistForm } from "./create-playlist-form";

export const metadata: Metadata = { title: "Playlists" };
export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  // Mis playlists + feed público (para destacar las del sistema), en paralelo.
  const [playlists, publicFeed] = await Promise.all([
    playlistsService.getMyPlaylists(),
    playlistsService
      .getPublicPlaylists(
        { limit: 30 },
        { next: { revalidate: 60, tags: [CACHE_TAGS.playlists] } }
      )
      .catch(() => ({ items: [] })),
  ]);

  // Curadas por el sistema (kind="system"): van primero, destacadas.
  const systemPlaylists = publicFeed.items.filter((pl) => pl.kind === "system");

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
            Las listas del sistema + tus listas armadas a mano.
          </p>
        </div>
      </div>

      {systemPlaylists.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles size={18} className="text-brand-400" aria-hidden />
            Curadas por Pulse Stream
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {systemPlaylists.map((pl) => (
              <Link key={pl.id} href={`/dashboard/playlists/${pl.id}`}>
                <Card className="h-full border-brand-400/40 transition-colors hover:border-brand-400">
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
                      <p className="line-clamp-2 text-xs text-text-subdued">
                        {pl.description || "Curada automáticamente por el sistema."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-bold">Tus playlists</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
    </div>
  );
}
