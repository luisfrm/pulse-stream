import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { BackLink } from "@/components/back-link";
import { Badge, Button } from "@/components/ui";
import { getUserLibrary } from "@/lib/services/library";
import { playlistsService } from "@/lib/services/playlists-service";
import { getSession } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { authorHandle } from "@/lib/utils/format";

import { PlaylistActions } from "./playlist-actions";
import { PlaylistEditForm } from "./playlist-edit-form";
import { PlaylistLikeButton } from "./playlist-like-button";
import { PlaylistPlayButton } from "./playlist-play-button";
import { PlaylistSongs } from "./playlist-songs";

export const dynamic = "force-dynamic";

interface PlaylistDetailPageProps {
  params: Promise<{ id: string }>;
}

const SONGS_PAGE_LIMIT = 20;

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

  // Metadata de la playlist, biblioteca del usuario, sesión y primera página
  // de canciones — todo en paralelo. La metadata sale de /playlists/{id};
  // las canciones paginadas salen de /songs?playlist_id para no traerlas
  // todas en un solo fetch.
  const [playlist, library, user, initialSongs] = await Promise.all([
    playlistsService.getPlaylistById(id).catch(() => null),
    getUserLibrary(),
    getSession(),
    songsService
      .getSongs(
        { playlistId: id, offset: 0, limit: SONGS_PAGE_LIMIT },
        { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } },
      )
      .catch(() => ({ items: [], total: 0, offset: 0, limit: SONGS_PAGE_LIMIT })),
  ]);
  if (!playlist) notFound();

  const refreshPlaylist = async () => {
    "use server";
    updateTag(CACHE_TAGS.playlists);
    updateTag(CACHE_TAGS.songs);
    updateTag(CACHE_TAGS.favorites);
  };

  const isUserPlaylist = playlist.kind === "user";
  const isOwner =
    isUserPlaylist &&
    user !== null &&
    playlist.owner_email === user.email;
  const isLiked = library?.playlistIds.has(playlist.id) ?? false;
  const songCount = initialSongs.total;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4">
        <BackLink href="/playlists" />
      </div>
      {/* Hero: cover grande + backdrop gradiente (tokens del @theme). */}
      <div className="relative overflow-hidden rounded-3xl border border-bg-highlight">
        <div aria-hidden className="absolute inset-0 bg-brand-gradient opacity-25" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-bg-base via-bg-base/40 to-transparent"
        />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:gap-8 sm:p-8">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight bg-bg-highlight/40 shadow-2xl sm:h-48 sm:w-48">
            {playlist.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={playlist.cover_url}
                alt={`Cover de ${playlist.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display text-5xl font-extrabold text-bg-base">
                {playlist.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {playlist.kind === "system" && (
                <Badge variant="success" size="sm">
                  <Sparkles size={11} aria-hidden /> Del sistema
                </Badge>
              )}
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

            <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="mt-2 text-sm text-text-subdued">{playlist.description}</p>
            )}
            <p className="mt-2 text-xs text-text-subdued">
              {songCount} {songCount === 1 ? "canción" : "canciones"}
              {isUserPlaylist && playlist.owner_email
                ? ` · ${authorHandle(playlist.owner_email)}`
                : ""}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <PlaylistPlayButton songs={initialSongs.items} />
              {playlist.kind === "system" && (
                <PlaylistLikeButton
                  playlistId={playlist.id}
                  initialLiked={isLiked}
                  onMutated={refreshPlaylist}
                />
              )}
              {isOwner && (
                <>
                  <PlaylistEditForm playlist={playlist} onMutated={refreshPlaylist} />
                  <PlaylistActions playlistId={playlist.id} onMutated={refreshPlaylist} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Canciones */}
      {songCount === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4">
          <p className="text-text-subdued">
            Esta playlist todavía no tiene canciones.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/songs">Explorar canciones</Link>
          </Button>
        </div>
      ) : (
        <PlaylistSongs
          playlistId={id}
          initialPage={initialSongs}
          library={library}
          onMutated={refreshPlaylist}
        />
      )}
    </div>
  );
}
