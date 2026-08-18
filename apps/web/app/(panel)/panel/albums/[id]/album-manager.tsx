"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { AudioPreviewPlayer } from "@/components/audio-preview-player";
import { CoverUploader } from "@/components/cover-uploader";
import { Button, Modal, Input } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import type { AlbumDetail } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface AlbumManagerProps {
  readonly album: AlbumDetail;
  readonly onMutated: () => Promise<void>;
}

/** Página admin del álbum: editar datos, ver y gestionar sus canciones. */
export function AlbumManager({ album, onMutated }: AlbumManagerProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(album.title);
  const [coverKey, setCoverKey] = React.useState<string | null>(album.cover_key ?? null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const songs = album.songs ?? [];
  const totalPlays = songs.reduce((sum, s) => sum + (s.play_count ?? 0), 0);

  async function saveAlbum(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await albumsService.update(album.id, {
        title: title.trim(),
        ...(coverKey !== album.cover_key ? { cover_key: coverKey ?? undefined } : {}),
      });
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      await albumsService.delete(album.id);
      router.push(`/panel/artists/${album.artist.id}`);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href={`/panel/artists/${album.artist.id}`}
        className="text-sm text-text-subdued hover:text-text-primary"
      >
        ← Volver a {album.artist.name}
      </Link>

      {/* Cabecera */}
      <div className="mt-2 flex flex-col items-start gap-5 sm:flex-row sm:items-end">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight shadow-lg">
          {album.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={album.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display text-5xl font-extrabold text-bg-base">
              {album.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-subdued">
            Álbum · Panel
          </p>
          <h1 className="font-display mt-1 text-4xl font-extrabold tracking-tight">
            {album.title}
          </h1>
          <Link
            href={`/panel/artists/${album.artist.id}`}
            className="mt-1 block text-sm text-brand-400 hover:underline"
          >
            {album.artist.name}
          </Link>
          <p className="mt-1 text-sm text-text-subdued">
            {songs.length} {songs.length === 1 ? "canción" : "canciones"} ·{" "}
            {totalPlays.toLocaleString("es")} reproducciones
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={saveAlbum}
          className="h-fit rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5"
        >
          <h2 className="font-display text-lg font-bold">Editar álbum</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del álbum"
            />
            <CoverUploader
              value={coverKey}
              previewUrl={album.cover_url}
              onChange={setCoverKey}
              label="Cover"
            />
            <div className="flex justify-between gap-3">
              <Button type="submit" loading={pending}>
                Guardar cambios
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
                Borrar álbum
              </Button>
            </div>
          </div>
        </form>

        <div className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5">
          <h2 className="font-display text-lg font-bold">Acciones</h2>
          <div className="mt-4 flex flex-col gap-3">
            <Link
              href={`/panel/songs/new?artist=${album.artist.id}&album=${album.id}`}
              className="flex items-center gap-2 rounded-pill bg-brand-400 px-4 py-2.5 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
            >
              <Plus size={16} aria-hidden /> Subir canción a este álbum
            </Link>
            <p className="text-xs text-text-subdued">
              El álbum pertenece a {album.artist.name}: las canciones que subas
              con esta opción quedarán asignadas automáticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Canciones del álbum */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Canciones del álbum</h2>
        {songs.length === 0 ? (
          <p className="mt-3 rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-6 text-sm text-text-subdued">
            Este álbum todavía no tiene canciones. Usá «Subir canción a este
            álbum» para agregar la primera.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {songs.map((song) => (
              <li
                key={song.id}
                className="rounded-xl border border-bg-highlight bg-bg-elevated p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-bg-highlight/40">
                    {song.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                        {song.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/panel/songs/${song.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {song.title}
                    </Link>
                    <p className="text-xs text-text-subdued">
                      {song.play_count?.toLocaleString("es") ?? 0} reproducciones
                    </p>
                  </div>
                  {song.stream_url && (
                    <AudioPreviewPlayer src={song.stream_url} title={song.title} />
                  )}
                  <Link
                    href={`/panel/songs/${song.id}`}
                    className="shrink-0 rounded-pill border border-bg-highlight px-3 py-1.5 text-xs text-text-subdued transition-colors hover:border-brand-400 hover:text-text-primary"
                  >
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Confirmación de borrado */}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="¿Borrar este álbum?"
        description={`"${album.title}" se eliminará. Las canciones quedan sin álbum (no se borran).`}
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleting(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={pending} onClick={handleDelete}>
            Sí, eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}