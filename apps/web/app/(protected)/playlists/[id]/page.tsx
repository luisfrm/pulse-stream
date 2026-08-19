import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";

import { SongItem } from "@/components/song-item";
import { Badge, Button } from "@/components/ui";
import { getUserLibrary } from "@/lib/services/library";
import { playlistsService } from "@/lib/services/playlists-service";
import { getSession } from "@/lib/services/session-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { authorHandle } from "@/lib/utils/format";

import { PlaylistActions } from "./playlist-actions";
import { PlaylistEditForm } from "./playlist-edit-form";
import { PlaylistLikeButton } from "./playlist-like-button";
import { PlaylistPlayButton } from "./playlist-play-button";

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

  // Playlist, biblioteca del usuario y sesión en paralelo (getSession está
  // deduplicada con React.cache: no genera un segundo /users/me).
  const [playlist, library, user] = await Promise.all([
    playlistsService.getPlaylistById(id).catch(() => null),
    getUserLibrary(),
    getSession(),
  ]);
  if (!playlist) notFound();

  const refreshPlaylist = async () => {
    "use server";
    updateTag(CACHE_TAGS.playlists);
    updateTag(CACHE_TAGS.songs);
    updateTag(CACHE_TAGS.favorites);
  };

  const isUserPlaylist = playlist.kind === "user";
  // Editar/borrar solo si es propia: una playlist pública de otro usuario
  // también tiene kind="user" pero no es mutable desde acá.
  const isOwner =
    isUserPlaylist &&
    user !== null &&
    playlist.owner_email === user.email;
  const isLiked = library?.playlistIds.has(playlist.id) ?? false;
  const songs = playlist.songs ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
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

            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="mt-2 text-sm text-text-subdued">{playlist.description}</p>
            )}
            <p className="mt-2 text-xs text-text-subdued">
              {playlist.song_count} {playlist.song_count === 1 ? "canción" : "canciones"}
              {isUserPlaylist && playlist.owner_email
                ? ` · ${authorHandle(playlist.owner_email)}`
                : ""}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <PlaylistPlayButton songs={songs} />
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
      {songs.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4">
          <p className="text-text-subdued">
            Esta playlist todavía no tiene canciones.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/songs">Explorar canciones</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 space-y-2.5">
          {songs.map((song) => (
            <SongItem
              key={song.id}
              song={song}
              queue={songs}
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