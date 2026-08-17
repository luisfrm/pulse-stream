"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CoverUploader } from "@/components/cover-uploader";
import { songsService } from "@/lib/services/songs-service";
import type { Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface SongsResultsProps {
  readonly initialSongs: Song[];
  readonly initialQuery: string;
  readonly page: number;
  readonly totalPages: number;
  readonly limit: number;
  readonly isAdmin: boolean;
  readonly onRevalidate: () => Promise<void>;
}

/**
 * Hoja cliente: recibe las canciones del RSC (initialData), renderiza el
 * reproductor, permite editar el cover y borrar + revalidación.
 */
export function SongsResults({
  initialSongs,
  initialQuery,
  page,
  totalPages,
  limit,
  isAdmin,
  onRevalidate,
}: SongsResultsProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingCoverId, setEditingCoverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const songs = initialSongs;
  const query = initialQuery;

  async function handleDelete(id: string) {
    if (!confirm("¿Borrar esta canción?")) return;
    setPendingId(id);
    setError(null);
    try {
      await songsService.deleteSong(id);
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
        <ul className="space-y-3">
          {songs.map((song) => (
            <li
              key={song.id}
              className="rounded-2xl border border-bg-highlight bg-bg-elevated p-5"
            >
              <div className="flex items-center gap-4">
                {/* Cover */}
                <Link
                  href={`/song/${song.id}`}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40"
                >
                  {song.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                      {song.title.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-bold">{song.title}</p>
                  <p className="truncate text-sm text-text-subdued">
                    {song.artist.name}
                    {(song.genres?.length ?? 0) > 0 && (
                      <span className="ml-2">· {song.genres!.join(", ")}</span>
                    )}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCoverId(editingCoverId === song.id ? null : song.id)
                      }
                      className="mt-1 text-xs text-text-subdued transition-colors hover:text-brand-400"
                    >
                      {editingCoverId === song.id ? "Cerrar cover" : "Editar cover"}
                    </button>
                  )}
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={pendingId === song.id}
                    onClick={() => handleDelete(song.id)}
                    className="shrink-0 rounded-pill px-3 py-1.5 text-sm text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary disabled:opacity-50"
                  >
                    {pendingId === song.id ? "Borrando…" : "Borrar"}
                  </button>
                )}
              </div>

              {song.stream_url ? (
                <audio
                  controls
                  preload="none"
                  src={song.stream_url}
                  className="mt-3 h-10 w-full"
                />
              ) : (
                <p className="mt-3 text-xs text-text-subdued">
                  Sin URL de reproducción (R2_PUBLIC_BASE_URL no configurado).
                </p>
              )}

              {editingCoverId === song.id && (
                <div className="mt-4 border-t border-bg-highlight pt-4">
                  <CoverUploader
                    value={song.cover_key}
                    previewUrl={song.cover_url}
                    onChange={(key) => handleCoverChange(song, key)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-text-subdued">
        Página {page} de {totalPages} · {limit} por página
      </p>
    </div>
  );
}
