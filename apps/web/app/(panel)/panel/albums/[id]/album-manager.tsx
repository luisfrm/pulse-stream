"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, Plus } from "lucide-react";

import { AudioPreviewPlayer } from "@/components/audio-preview-player";
import { CoverUploader } from "@/components/cover-uploader";
import { NoCover } from "@/components/no-cover";
import { Button, Modal, Input } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import type { AlbumDetail, Artist, ZipImportResult } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

import { AlbumSongModal } from "./album-song-modal";

interface AlbumManagerProps {
  readonly album: AlbumDetail;
  readonly genres: string[];
  readonly artists: Artist[];
  readonly onMutated: () => Promise<void>;
}

/** Admin page for an album: edit metadata, upload songs, and manage its tracklist. */
export function AlbumManager({ album, genres, artists, onMutated }: AlbumManagerProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(album.title);
  const [coverKey, setCoverKey] = React.useState<string | null>(album.cover_key ?? null);
  const [pending, setPending] = React.useState(false);
  const [savedBanner, setSavedBanner] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ZipImportResult | null>(
    null
  );
  const zipInputRef = React.useRef<HTMLInputElement>(null);

  const songs = album.songs ?? [];
  const totalPlays = songs.reduce((sum, s) => sum + (s.play_count ?? 0), 0);

  async function handleImportZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Elegí un archivo .zip.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const result = await albumsService.importZip(album.id, file);
      setImportResult(result);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setImporting(false);
    }
  }

  async function saveAlbum(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSavedBanner(false);
    try {
      await albumsService.update(album.id, {
        title: title.trim(),
        ...(coverKey !== album.cover_key ? { cover_key: coverKey ?? undefined } : {}),
      });
      await onMutated();
      router.refresh();
      setSavedBanner(true);
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
            <NoCover size="lg" />
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

      {savedBanner && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-400/15 px-4 py-3 text-sm text-brand-200">
          <CheckCircle2 size={16} className="shrink-0" aria-hidden />
          <span>Cambios guardados.</span>
        </p>
      )}

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
            <Button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="w-full"
            >
              <Plus size={16} aria-hidden /> Subir canción a este álbum
            </Button>
            <Button
              type="button"
              variant="outline"
              loading={importing}
              onClick={() => zipInputRef.current?.click()}
              className="w-full"
            >
              <Archive size={16} aria-hidden />
              {importing ? "Importando…" : "Importar ZIP"}
            </Button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              aria-label="Seleccionar archivo ZIP"
              className="hidden"
              onChange={handleImportZip}
            />
            <p className="text-xs text-text-subdued">
              Un ZIP con los .mp3, .aac o .m4a del álbum: cada canción se crea
              con el artista y el cover de este álbum; el título sale del
              nombre del archivo (los tags ID3 se ignoran). Archivos que no
              cumplan se listan al finalizar.
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
                      <NoCover size="sm" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/panel/songs/${song.id}?returnTo=${encodeURIComponent(`/panel/albums/${album.id}`)}`}
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
                    href={`/panel/songs/${song.id}?returnTo=${encodeURIComponent(`/panel/albums/${album.id}`)}`}
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

      {/* Resultado de la importación ZIP */}
      <Modal
        open={importResult !== null}
        onClose={() => setImportResult(null)}
        title="Importación desde ZIP"
        description={
          importResult
            ? `${importResult.imported?.length ?? 0} ${
                (importResult.imported?.length ?? 0) === 1 ? "canción" : "canciones"
              } importadas · ${importResult.skipped?.length ?? 0} saltadas · ${
                importResult.failed?.length ?? 0
              } fallidas`
            : undefined
        }
      >
        {(importResult?.skipped?.length ?? 0) > 0 ||
        (importResult?.failed?.length ?? 0) > 0 ? (
          <div className="space-y-4">
            {(importResult?.failed?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-200">
                  Fallidas
                </p>
                <ul className="space-y-2">
                  {importResult?.failed?.map((issue, index) => (
                    <li
                      key={`failed-${issue.name}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-3.5 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">{issue.name}</span>
                      <span className="shrink-0 text-xs text-text-subdued">
                        {issue.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(importResult?.skipped?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-subdued">
                  Saltadas
                </p>
                <ul className="space-y-2">
                  {importResult?.skipped?.map((issue, index) => (
                    <li
                      key={`skipped-${issue.name}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-3.5 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">{issue.name}</span>
                      <span className="shrink-0 text-xs text-text-subdued">
                        {issue.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-subdued">
            Todas las canciones del ZIP se importaron correctamente.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button onClick={() => setImportResult(null)}>Listo</Button>
        </div>
      </Modal>

      <AlbumSongModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        album={album}
        genres={genres}
        artists={artists}
        onCreated={onMutated}
      />

      {/* Confirmación de borrado (la API bloquea si el álbum tiene canciones) */}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="¿Borrar este álbum?"
        description={
          songs.length > 0
            ? `"${album.title}" tiene ${songs.length} ${songs.length === 1 ? "canción" : "canciones"}: primero reasignalas a otro álbum (las canciones requieren álbum).`
            : `"${album.title}" se eliminará. Esta acción no se puede deshacer.`
        }
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