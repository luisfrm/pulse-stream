"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Disc3, Loader2, Minus, Music, Plus, Trash2 } from "lucide-react";

import { CoverUploader } from "@/components/cover-uploader";
import { Button, cn, Modal, Input } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import type { Album, Artist, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface ArtistManagerProps {
  readonly artist: Artist;
  readonly albums: Album[];
  readonly songs: Song[];
  readonly collaborations: Song[];
  readonly onMutated: () => Promise<void>;
}

/** Página admin del artista: editar datos, crear álbumes y gestionar canciones. */
export function ArtistManager({
  artist,
  albums,
  songs,
  collaborations,
  onMutated,
}: ArtistManagerProps) {
  const router = useRouter();
  const [name, setName] = React.useState(artist.name);
  const [coverKey, setCoverKey] = React.useState<string | null>(artist.cover_key ?? null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deletingAlbumId, setDeletingAlbumId] = React.useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = React.useState(false);
  // Mantiene el form montado durante la animación de salida.
  const [albumClosing, setAlbumClosing] = React.useState(false);

  function toggleAlbumForm() {
    if (albumOpen) {
      setAlbumOpen(false);
      setAlbumClosing(true);
    } else {
      setAlbumOpen(true);
      setAlbumClosing(false);
    }
  }

  const totalPlays = songs.reduce((sum, s) => sum + (s.play_count ?? 0), 0);
  const totalSongs = songs.length + collaborations.length;

  async function saveArtist(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await artistsService.updateArtist(artist.id, {
        name: name.trim(),
        ...(coverKey !== artist.cover_key ? { cover_key: coverKey ?? undefined } : {}),
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
      await artistsService.deleteArtist(artist.id);
      router.push("/panel/artists");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  }

  async function handleDeleteAlbum(id: string) {
    setDeletingAlbumId(id);
    setError(null);
    try {
      await albumsService.delete(id);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDeletingAlbumId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/panel/artists"
        className="text-sm text-text-subdued hover:text-text-primary"
      >
        ← Volver a artistas
      </Link>

      {/* Cabecera */}
      <div className="mt-2 flex flex-col items-start gap-5 sm:flex-row sm:items-end">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight shadow-lg">
          {artist.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display text-4xl font-extrabold text-bg-base">
              {artist.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-subdued">
            Artista · Panel
          </p>
          <h1 className="font-display mt-1 text-4xl font-extrabold tracking-tight">
            {artist.name}
          </h1>
          <p className="mt-1 text-sm text-text-subdued">
            {totalSongs} {totalSongs === 1 ? "canción" : "canciones"} · {albums.length}{" "}
            {albums.length === 1 ? "álbum" : "álbumes"} ·{" "}
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
        {/* Edición de datos */}
        <form
          onSubmit={saveArtist}
          className="h-fit rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5"
        >
          <h2 className="font-display text-lg font-bold">Editar artista</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del artista"
            />
            <CoverUploader
              value={coverKey}
              previewUrl={artist.cover_url}
              onChange={setCoverKey}
              label="Cover"
            />
            <div className="flex justify-between gap-3">
              <Button type="submit" loading={pending}>
                Guardar cambios
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                Borrar artista
              </Button>
            </div>
          </div>
        </form>

        {/* Analytics */}
        <div className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5">
          <h2 className="font-display text-lg font-bold">Resumen</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Canciones", value: totalSongs },
              { label: "Álbumes", value: albums.length },
              { label: "Reproducciones", value: totalPlays.toLocaleString("es") },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3"
              >
                <dt className="text-xs text-text-subdued">{stat.label}</dt>
                <dd className="font-display text-2xl font-bold">{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-text-subdued">
            Las reproducciones son el acumulado de las canciones listadas (hasta
            100). Los colaboradores no cuentan como canciones propias.
          </p>
        </div>
      </div>

      {/* Álbumes */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Álbumes</h2>
          <Button size="sm" onClick={toggleAlbumForm} aria-expanded={albumOpen}>
            {albumOpen ? (
              <Minus size={15} aria-hidden />
            ) : (
              <Plus size={15} aria-hidden />
            )}{" "}
            {albumOpen ? "Cerrar" : "Agregar álbum"}
          </Button>
        </div>

        {(albumOpen || albumClosing) && (
          <div
            className={cn(
              albumOpen ? "animate-rise" : "animate-collapse"
            )}
            onAnimationEnd={() => {
              if (albumClosing) setAlbumClosing(false);
            }}
          >
            <CreateAlbumForm
              artist={artist}
              onCreated={async () => {
                await onMutated();
                router.refresh();
              }}
            />
          </div>
        )}

        {albums.length === 0 ? (
          <p className="mt-3 rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-6 text-sm text-text-subdued">
            Este artista todavía no tiene álbumes. Agregá el primero con el botón
            de arriba.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <li
                key={album.id}
                className="group flex items-center gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3 transition-colors hover:border-brand-400"
              >
                <Link
                  href={`/panel/albums/${album.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
                    {album.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={album.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                        {album.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-display text-sm font-bold hover:underline">
                      <Disc3 size={13} className="shrink-0 text-text-subdued" />
                      {album.title}
                    </p>
                    <p className="truncate text-xs text-text-subdued">
                      {album.song_count} {album.song_count === 1 ? "canción" : "canciones"}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteAlbum(album.id)}
                  disabled={deletingAlbumId === album.id}
                  aria-label={`Borrar ${album.title}`}
                  className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-brand-900/30 hover:text-brand-200 disabled:opacity-50"
                >
                  {deletingAlbumId === album.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Canciones propias */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Canciones</h2>
          <Link
            href={`/panel/songs/new?artist=${artist.id}`}
            className="rounded-pill bg-brand-400 px-4 py-2 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
          >
            + Subir canción
          </Link>
        </div>
        {songs.length === 0 ? (
          <p className="mt-3 rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-6 text-sm text-text-subdued">
            Todavía no hay canciones de este artista.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {songs.map((song) => (
              <li key={song.id}>
                <Link
                  href={`/panel/songs/${song.id}`}
                  className="flex items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-3 py-2 transition-colors hover:border-brand-400"
                >
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
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{song.title}</span>
                    <span className="block truncate text-xs text-text-subdued">
                      {song.album ? `del álbum ${song.album.title}` : "sin álbum"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-text-subdued">
                    {song.play_count?.toLocaleString("es") ?? 0} plays
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Colaboraciones */}
      {collaborations.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Colaboraciones</h2>
          <p className="mt-1 text-sm text-text-subdued">
            Canciones donde participa como invitado.
          </p>
          <ul className="mt-3 space-y-2">
            {collaborations.map((song) => (
              <li key={song.id}>
                <Link
                  href={`/panel/songs/${song.id}`}
                  className="flex items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-3 py-2 transition-colors hover:border-brand-400"
                >
                  <Music size={16} className="shrink-0 text-text-subdued" />
                  <span className="min-w-0 flex-1 truncate text-sm">{song.title}</span>
                  <span className="shrink-0 text-xs text-text-subdued">
                    {song.artist.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Confirmación de borrado del artista */}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="¿Borrar este artista?"
        description={`"${artist.name}" se eliminará junto con todas sus canciones y álbumes. Esta acción no se puede deshacer.`}
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

function CreateAlbumForm({
  artist,
  onCreated,
}: {
  artist: Artist;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [coverKey, setCoverKey] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return setError("Falta el título del álbum.");
    setPending(true);
    setError(null);
    try {
      await albumsService.create({
        title: title.trim(),
        artist_id: artist.id,
        ...(coverKey ? { cover_key: coverKey } : {}),
      });
      setTitle("");
      setCoverKey(null);
      await onCreated();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-4"
    >
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Input
            label="Título del álbum"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Bocanada"
          />
        </div>
        <CoverUploader value={coverKey} onChange={setCoverKey} label="Cover (opcional)" />
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> Creando…
            </>
          ) : (
            "Crear álbum"
          )}
        </Button>
      </div>
      {error && (
        <p className="mt-3 rounded-xl bg-brand-900/30 px-4 py-2 text-sm text-brand-200">
          {error}
        </p>
      )}
    </form>
  );
}