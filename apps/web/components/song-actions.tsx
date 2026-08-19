"use client";

import { FavoriteButton } from "@/components/favorite-button";
import { OfflineButton } from "@/components/offline-button";
import { PlaylistPicker } from "@/components/playlist-picker";
import type { MyPlaylist, Song } from "@/lib/services/types";

interface SongActionsProps {
  song: Song;
  initialFavorited: boolean;
  playlists?: MyPlaylist[];
  onMutated?: () => Promise<void>;
}

/** Acciones de canción por fila: corazón + "+" (playlist) + descarga offline. */
export function SongActions({
  song,
  initialFavorited,
  playlists = [],
  onMutated,
}: SongActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <FavoriteButton
        songId={song.id}
        initialFavorited={initialFavorited}
        onMutated={onMutated}
      />
      <PlaylistPicker song={song} playlists={playlists} onMutated={onMutated} />
      <OfflineButton song={song} compact />
    </div>
  );
}
