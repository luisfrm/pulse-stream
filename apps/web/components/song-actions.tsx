"use client";

import * as React from "react";
import { Heart, ListPlus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { BottomSheet, Button, Input, Textarea } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import { playlistsService } from "@/lib/services/playlists-service";
import type { Playlist, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";
import { cn } from "@/components/ui";

interface SongActionsProps {
  song: Song;
  initialFavorited: boolean;
  playlists?: Playlist[];
  onMutated?: () => Promise<void>;
}

/** Corazón (favorito) + agregar a playlist — acciones de usuario por canción. */
export function SongActions({ song, initialFavorited, playlists = [], onMutated }: SongActionsProps) {
  const router = useRouter();
  const [favorited, setFavorited] = React.useState(initialFavorited);
  const [favoritePending, setFavoritePending] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [playlistPending, setPlaylistPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [createPending, setCreatePending] = React.useState(false);

  async function toggleFavorite() {
    if (favoritePending) return;
    setFavoritePending(true);
    setError(null);
    try {
      if (favorited) {
        await favoritesService.remove(song.id);
      } else {
        await favoritesService.add(song.id);
      }
      setFavorited((f) => !f);
      await onMutated?.();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setFavoritePending(false);
    }
  }

  async function handleAddToPlaylist(playlistId: string) {
    setPlaylistPending(playlistId);
    setError(null);
    try {
      await playlistsService.addSong(playlistId, song.id);
      setSheetOpen(false);
      await onMutated?.();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPlaylistPending(null);
    }
  }

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatePending(true);
    setError(null);
    try {
      const pl = await playlistsService.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      await playlistsService.addSong(pl.id, song.id);
      setNewName("");
      setNewDesc("");
      setCreating(false);
      setSheetOpen(false);
      await onMutated?.();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={favoritePending}
        aria-label={favorited ? "Quitar de favoritos" : "Agregar a favoritos"}
        aria-pressed={favorited}
        className={cn(
          "rounded-pill p-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-50",
          favorited ? "text-brand-400" : "text-text-subdued hover:text-brand-400"
        )}
      >
        <Heart size={18} fill={favorited ? "currentColor" : "none"} />
      </button>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Agregar a playlist"
        className="rounded-pill p-2 text-text-subdued transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
      >
        <ListPlus size={18} />
      </button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Agregar a playlist">
        <div className="flex flex-col gap-3">
          {error && (
            <p className="rounded-xl bg-brand-900/30 px-4 py-2.5 text-sm text-brand-200">{error}</p>
          )}

          {creating ? (
            <form onSubmit={handleCreatePlaylist} className="flex flex-col gap-3">
              <Input
                label="Nombre"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Mis favoritas del viaje"
                autoFocus
                required
              />
              <Textarea
                label="Descripción (opcional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="Una playlist para…"
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                  Volver
                </Button>
                <Button type="submit" loading={createPending} disabled={!newName.trim()}>
                  Crear y agregar
                </Button>
              </div>
            </form>
          ) : (
            <>
              {playlists.length === 0 ? (
                <p className="text-sm text-text-subdued">Todavía no tenés playlists.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {playlists.map((pl) => (
                    <li key={pl.id}>
                      <button
                        type="button"
                        onClick={() => handleAddToPlaylist(pl.id)}
                        disabled={playlistPending === pl.id}
                        className="flex w-full items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-3.5 py-2.5 text-left text-sm transition-colors hover:border-brand-400 disabled:opacity-60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{pl.name}</span>
                          <span className="block text-xs text-text-subdued">
                            {pl.song_count} {pl.song_count === 1 ? "canción" : "canciones"}
                          </span>
                        </span>
                        {playlistPending === pl.id && <span className="text-xs">…</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus size={16} /> Nueva playlist
              </Button>
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
