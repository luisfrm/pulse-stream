"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { CoverUploader } from "@/components/cover-uploader";
import { Button, Select } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import type { Album, Artist } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface AlbumsManagerProps {
  readonly initialAlbums: Album[];
  readonly initialArtists: Artist[];
  readonly onMutated: () => Promise<void>;
}

/** Gestión de álbumes: crear (con cover) + listar con borrado. */
export function AlbumsManager({
  initialAlbums,
  initialArtists,
  onMutated,
}: AlbumsManagerProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [artistId, setArtistId] = React.useState("");
  const [coverKey, setCoverKey] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const artistOptions = initialArtists.map((a) => ({
    value: a.id,
    label: a.name,
  }));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !artistId) {
      setError("Completá el título y elegí un artista.");
      return;
    }
    setPending(true);
    try {
      await albumsService.create({
        title: title.trim(),
        artist_id: artistId,
        ...(coverKey ? { cover_key: coverKey } : {}),
      });
      setTitle("");
      setCoverKey(null);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Borrar este álbum? Las canciones quedan sin álbum.")) return;
    setDeletingId(id);
    setError(null);
    try {
      await albumsService.delete(id);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
      <form
        onSubmit={handleCreate}
        className="h-fit rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5"
      >
        <h2 className="font-display text-lg font-bold">Nuevo álbum</h2>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ej. Bocanada"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
            />
          </label>

          <Select
            label="Artista"
            options={artistOptions}
            value={artistId}
            onChange={setArtistId}
            placeholder="Elegí un artista…"
            searchable
          />

          <CoverUploader value={coverKey} onChange={setCoverKey} label="Cover (opcional)" />

          {error && (
            <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden /> Creando…
              </>
            ) : (
              "Crear álbum"
            )}
          </Button>
        </div>
      </form>

      <div>
        {initialAlbums.length === 0 ? (
          <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
            Todavía no hay álbumes. Creá el primero.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {initialAlbums.map((album) => (
              <li
                key={album.id}
                className="group flex items-center gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3 transition-colors hover:border-brand-400"
              >
                <Link
                  href={`/album/${album.id}`}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40"
                >
                  {album.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={album.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                      {album.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/album/${album.id}`}
                    className="block truncate font-display text-sm font-bold hover:underline"
                  >
                    {album.title}
                  </Link>
                  <p className="truncate text-xs text-text-subdued">
                    {album.artist.name} · {album.song_count}{" "}
                    {album.song_count === 1 ? "canción" : "canciones"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(album.id)}
                  disabled={deletingId === album.id}
                  aria-label={`Borrar ${album.title}`}
                  className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-brand-900/30 hover:text-brand-200 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
