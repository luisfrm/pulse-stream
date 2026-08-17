"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Dialog } from "@/components/ui";
import { songsService } from "@/lib/services/songs-service";
import type { Album, Artist, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

import { PanelSongCard } from "./panel-song-card";
import { SongEditDialog } from "./song-edit-dialog";

interface SongsResultsProps {
  readonly initialSongs: Song[];
  readonly initialQuery: string;
  readonly page: number;
  readonly totalPages: number;
  readonly limit: number;
  readonly isAdmin: boolean;
  readonly genres: string[];
  /** Álbumes para el editor de canciones. */
  readonly albums: Album[];
  /** Artistas para el editor (colaboradores). */
  readonly artists: Artist[];
  readonly onRevalidate: () => Promise<void>;
}

/**
 * Hoja cliente: grid de cards de canciones con preview propio, edición de
 * metadatos y de cover, y borrado con confirmación (diálogo, no `confirm()`).
 */
export function SongsResults({
  initialSongs,
  initialQuery,
  page,
  totalPages,
  limit,
  isAdmin,
  genres,
  albums,
  artists,
  onRevalidate,
}: SongsResultsProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Song | null>(null);
  const [editing, setEditing] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);

  const songs = initialSongs;
  const query = initialQuery;

  async function confirmDelete() {
    if (!deleting) return;
    setPendingId(deleting.id);
    setError(null);
    try {
      await songsService.deleteSong(deleting.id);
      setDeleting(null);
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleCoverChange(song: Song, coverKey: string | null) {
    setError(null);
    try {
      await songsService.updateSong(song.id, { cover_key: coverKey ?? undefined });
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-4 rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
          {error}
        </p>
      )}

      {songs.length === 0 ? (
        <p className="mt-10 text-text-subdued">
          {query ? "Sin resultados para tu búsqueda." : "Todavía no hay canciones."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {songs.map((song) => (
            <PanelSongCard
              key={song.id}
              song={song}
              pending={pendingId === song.id}
              onEdit={(s) => setEditing(s)}
              onDelete={(s) => setDeleting(s)}
              onCoverChange={handleCoverChange}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-text-subdued">
        Página {page} de {totalPages} · {limit} por página
      </p>

      {/* Confirmación de borrado */}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="¿Borrar esta canción?"
        description={
          deleting
            ? `"${deleting.title}" se eliminará del catálogo y de las playlists de la comunidad. Esta acción no se puede deshacer.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={pendingId === deleting?.id}
            onClick={confirmDelete}
          >
            Sí, eliminar
          </Button>
        </div>
      </Dialog>

      {/* Edición de metadatos */}
      {isAdmin && (
        <SongEditDialog
          key={editing?.id ?? "none"}
          song={editing}
          genres={genres}
          albums={albums}
          artists={artists}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await onRevalidate();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}