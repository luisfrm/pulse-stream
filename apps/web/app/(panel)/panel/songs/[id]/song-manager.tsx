"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { AudioPreviewPlayer } from "@/components/audio-preview-player";
import { CoverUploader } from "@/components/cover-uploader";
import { Button, Checkbox, Modal, Input, Select, Textarea } from "@/components/ui";
import { songsService } from "@/lib/services/songs-service";
import type { Album, Artist, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";
import { formatGenre } from "@/lib/utils/format";

interface SongManagerProps {
  readonly song: Song;
  readonly genres: string[];
  readonly albums: Album[];
  readonly artists: Artist[];
  readonly onMutated: () => Promise<void>;
}

/** Página admin de la canción: datos, metadatos, cover y analytics. */
export function SongManager({
  song,
  genres,
  albums,
  artists,
  onMutated,
}: SongManagerProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(song.title);
  const [artistId, setArtistId] = React.useState<string>(song.artist.id);
  const [albumId, setAlbumId] = React.useState<string>(song.album?.id ?? "");
  const [selectedGenres, setSelectedGenres] = React.useState<string[]>(song.genres ?? []);
  const [collaboratorIds, setCollaboratorIds] = React.useState<string[]>(
    song.collaborators?.map((c) => c.id) ?? []
  );
  const [lyrics, setLyrics] = React.useState(song.lyrics ?? "");
  const [duration, setDuration] = React.useState<string>(
    song.duration_seconds ? String(song.duration_seconds) : ""
  );
  const [coverKey, setCoverKey] = React.useState<string | null>(song.cover_key ?? null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const selectedArtistAlbums = albums.filter((a) => a.artist.id === artistId);
  const artistOptions = artists.map((a) => ({ value: a.id, label: a.name }));
  const albumOptions = selectedArtistAlbums.map((a) => ({
    value: a.id,
    label: a.title,
  }));

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  function toggleCollaborator(id: string) {
    setCollaboratorIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return setError("El título no puede quedar vacío.");
    setPending(true);
    setError(null);
    try {
      await songsService.updateSong(song.id, {
        title: title.trim(),
        artist_id: artistId,
        album_id: albumId === "" ? null : albumId,
        genres: selectedGenres,
        lyrics: lyrics.trim() || undefined,
        duration_seconds: duration ? Number(duration) : undefined,
        ...(coverKey !== song.cover_key ? { cover_key: coverKey ?? undefined } : {}),
        collaborator_ids: collaboratorIds,
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
      await songsService.deleteSong(song.id);
      router.push("/panel/songs");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/panel/songs"
        className="text-sm text-text-subdued hover:text-text-primary"
      >
        ← Volver a canciones
      </Link>

      {/* Cabecera */}
      <div className="mt-2 flex flex-col items-start gap-5 sm:flex-row sm:items-end">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight shadow-lg">
          {song.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display text-4xl font-extrabold text-bg-base">
              {song.title.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-subdued">
            Canción · Panel
          </p>
          <h1 className="font-display mt-1 text-4xl font-extrabold tracking-tight">
            {song.title}
          </h1>
          <Link
            href={`/panel/artists/${song.artist.id}`}
            className="mt-1 block text-sm text-brand-400 hover:underline"
          >
            {song.artist.name}
          </Link>
          <p className="mt-1 text-sm text-text-subdued">
            {(song.play_count ?? 0).toLocaleString("es")} reproducciones
          </p>
        </div>
        {song.stream_url && (
          <div className="w-full sm:w-auto">
            <AudioPreviewPlayer src={song.stream_url} title={song.title} />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5"
      >
        <h2 className="font-display text-lg font-bold">Metadatos</h2>

        <div className="mt-4 flex flex-col gap-4">
          <Input
            label="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre de la canción"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Artista"
              options={artistOptions}
              value={artistId}
              onChange={(id) => {
                setArtistId(id);
                setAlbumId(""); // el álbum pertenece al artista elegido
              }}
              placeholder="Elegí un artista…"
              searchable
            />
            <Select
              label="Álbum"
              options={albumOptions}
              value={albumId}
              onChange={setAlbumId}
              placeholder={selectedArtistAlbums.length === 0 ? "Sin álbumes" : "Sin álbum"}
              emptyLabel="Este artista no tiene álbumes"
            />
          </div>

          <fieldset className="flex flex-col text-sm font-medium">
            <legend className="mb-2">Géneros</legend>
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => {
                const selected = selectedGenres.includes(genre);
                return (
                  <label
key={genre}
                      className="cursor-pointer select-none"
                    >
                      <Checkbox
                        className="peer absolute size-px opacity-0"
                        checked={selected}
                        onCheckedChange={() => toggleGenre(genre)}
                      />
                      <span
                        className={`inline-flex items-center rounded-pill border px-3 py-1.5 text-sm leading-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400/40 ${
                          selected
                            ? "border-brand-400 bg-brand-400/20 text-brand-200"
                            : "border-bg-highlight text-text-subdued hover:border-brand-400"
                        }`}
                      >
                        {formatGenre(genre)}
                      </span>
                    </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col text-sm font-medium">
            <legend className="mb-2">Colaboradores</legend>
            <div className="flex flex-wrap gap-2">
              {artists
                .filter((a) => a.id !== artistId)
                .map((artist) => {
                  const selected = collaboratorIds.includes(artist.id);
                  return (
                    <label
key={artist.id}
                        className="cursor-pointer select-none"
                      >
                        <Checkbox
                          className="peer absolute size-px opacity-0"
                          checked={selected}
                          onCheckedChange={() => toggleCollaborator(artist.id)}
                        />
                        <span
                          className={`inline-flex items-center rounded-pill border px-3 py-1.5 text-sm leading-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400/40 ${
                            selected
                              ? "border-brand-400 bg-brand-400/20 text-brand-200"
                              : "border-bg-highlight text-text-subdued hover:border-brand-400"
                          }`}
                        >
                          {artist.name}
                        </span>
                      </label>
                  );
                })}
            </div>
          </fieldset>

          <Input
            label="Duración (segundos, opcional)"
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Ej. 215"
          />

          <Textarea
            label="Letra (opcional)"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={5}
            placeholder="La letra de la canción…"
          />

          <CoverUploader
            value={coverKey}
            previewUrl={song.cover_url}
            onChange={setCoverKey}
            label="Cover"
          />

          <div className="flex justify-between gap-3">
            <div className="flex gap-3">
              <Button type="submit" loading={pending}>
                Guardar cambios
              </Button>
              <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
                <Trash2 size={15} aria-hidden /> Borrar
              </Button>
            </div>
          </div>
        </div>
      </form>

      {/* Confirmación de borrado */}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="¿Borrar esta canción?"
        description={`"${song.title}" se eliminará del catálogo y de las playlists. Esta acción no se puede deshacer.`}
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