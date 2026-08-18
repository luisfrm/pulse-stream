import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SongItem } from "@/components/song-item";
import { Badge, Button, Title } from "@/components/ui";
import { getUserLibrary } from "@/lib/services/library";
import { playlistsService } from "@/lib/services/playlists-service";
import { CACHE_TAGS } from "@/lib/services/tags";

import { PlaylistActions } from "./playlist-actions";

export const dynamic = "force-dynamic";

interface PlaylistDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PlaylistDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const pl = await playlistsService.getPlaylistById(id);
    return { title: pl.name };
  } catch {
    return { title: "Playlist" };
  }
}

export default async function PlaylistDetailPage({ params }: PlaylistDetailPageProps) {
  const { id } = await params;

  // Playlist y biblioteca del usuario en paralelo.
  const [playlist, library] = await Promise.all([
    playlistsService.getPlaylistById(id).catch(() => null),
    getUserLibrary(),
  ]);
  if (!playlist) notFound();

  const refreshPlaylist = async () => {
    "use server";
    updateTag(CACHE_TAGS.playlists);
    updateTag(CACHE_TAGS.songs);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight bg-bg-highlight/40">
          {playlist.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={playlist.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-bg-base">
              {playlist.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Title as="h1" size="card">
              {playlist.name}
            </Title>
            {playlist.is_public ? (
              <Badge variant="success" size="sm">
                pública
              </Badge>
            ) : (
              <Badge variant="glass" size="sm">
                privada
              </Badge>
            )}
          </div>
          {playlist.description && (
            <p className="mt-1 text-sm text-text-subdued">{playlist.description}</p>
          )}
          <p className="mt-1 text-xs text-text-subdued">
            {playlist.song_count} {playlist.song_count === 1 ? "canción" : "canciones"}
          </p>
        </div>
        <PlaylistActions playlistId={playlist.id} onMutated={refreshPlaylist} />
      </div>

      {(playlist.songs ?? []).length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4">
          <p className="text-text-subdued">
            Esta playlist todavía no tiene canciones.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Buscar en el catálogo</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 space-y-2.5">
          {(playlist.songs ?? []).map((song) => (
            <SongItem
              key={song.id}
              song={song}
              queue={playlist.songs}
              favoriteIds={library?.favoriteIds}
              playlists={library?.playlists}
              onMutated={refreshPlaylist}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
