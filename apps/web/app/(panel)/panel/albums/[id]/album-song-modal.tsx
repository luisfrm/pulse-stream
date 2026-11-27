"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Music2 } from "lucide-react";

import { Button, Checkbox, FileInput, Input, Modal, Textarea } from "@/components/ui";
import type { AlbumDetail, Artist } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";
import { formatGenre } from "@/lib/utils/format";
import { uploadAndCreateSong } from "@/lib/utils/song-upload";

interface AlbumSongModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly album: AlbumDetail;
  readonly genres: string[];
  readonly artists: Artist[];
  readonly onCreated: () => Promise<void>;
}

/**
 * In-context modal for uploading a song directly to an album without leaving its page.
 */
export function AlbumSongModal({
  open,
  onClose,
  album,
  genres,
  artists,
  onCreated,
}: AlbumSongModalProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [selectedGenres, setSelectedGenres] = React.useState<string[]>([]);
  const [collaboratorIds, setCollaboratorIds] = React.useState<string[]>([]);
  const [lyrics, setLyrics] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [pendingMode, setPendingMode] = React.useState<"close" | "another" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const collaboratorOptions = React.useMemo(
    () => artists.filter((a) => a.id !== album.artist.id),
    [artists, album.artist.id]
  );

  function resetFields() {
    setTitle("");
    setSelectedGenres([]);
    setCollaboratorIds([]);
    setLyrics("");
    setFile(null);
  }

  function handleClose() {
    if (pendingMode !== null) return;
    setError(null);
    setSuccessMessage(null);
    onClose();
  }

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

  async function submitSong(mode: "close" | "another") {
    setError(null);
    setSuccessMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Falta el título.");
      return;
    }
    if (!file) {
      setError("Elegí un archivo .mp3, .aac o .m4a para subir.");
      return;
    }

    setPendingMode(mode);
    try {
      await uploadAndCreateSong({
        title: trimmedTitle,
        artistId: album.artist.id,
        albumId: album.id,
        genres: selectedGenres,
        lyrics,
        collaboratorIds,
        file,
      });

      await onCreated();
      router.refresh();
      resetFields();

      if (mode === "close") {
        onClose();
      } else {
        setSuccessMessage(`"${trimmedTitle}" se agregó al álbum. Podés subir otra.`);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPendingMode(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submitSong("close");
  }

  const isPending = pendingMode !== null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Subir canción al álbum"
      description={`${album.title} · ${album.artist.name}`}
    >
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        {successMessage && (
          <p className="flex items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-400/15 px-3.5 py-2.5 text-sm text-brand-200">
            <CheckCircle2 size={16} className="shrink-0" aria-hidden />
            <span>{successMessage}</span>
          </p>
        )}

        <Input
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Ej. De Música Ligera"
        />

        <fieldset className="flex flex-col text-sm font-medium">
          <legend className="mb-2">Géneros</legend>
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <label key={genre} className="cursor-pointer select-none">
                <Checkbox
                  className="peer absolute size-px opacity-0"
                  checked={selectedGenres.includes(genre)}
                  onCheckedChange={() => toggleGenre(genre)}
                />
                <span
                  className={`inline-flex items-center rounded-pill border px-3 py-1.5 text-sm leading-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400/40 ${
                    selectedGenres.includes(genre)
                      ? "border-brand-400 bg-brand-400/20 text-brand-200"
                      : "border-bg-highlight text-text-subdued hover:border-brand-400"
                  }`}
                >
                  {formatGenre(genre)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {collaboratorOptions.length > 0 && (
          <fieldset className="flex flex-col text-sm font-medium">
            <legend className="mb-2">Colaboradores (opcional)</legend>
            <div className="flex flex-wrap gap-2">
              {collaboratorOptions.map((artist) => {
                const selected = collaboratorIds.includes(artist.id);
                return (
                  <label key={artist.id} className="cursor-pointer select-none">
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
        )}

        <Textarea
          label="Letra (opcional)"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={4}
          placeholder="La letra de la canción…"
        />

        <FileInput
          label="Archivo de audio (.mp3, .aac, .m4a)"
          icon={<Music2 size={16} />}
          accept="audio/mpeg,.mp3,audio/aac,audio/x-hx-aac-adts,audio/vnd.dlna.adts,.aac,audio/mp4,audio/x-m4a,audio/m4a,.m4a"
          value={file}
          onChange={setFile}
          hint="Formatos MP3, AAC o M4A · máximo 50 MB"
        />

        {error && (
          <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={pendingMode === "another"}
            disabled={pendingMode === "close"}
            onClick={() => void submitSong("another")}
          >
            Subir y agregar otra
          </Button>
          <Button
            type="submit"
            loading={pendingMode === "close"}
            disabled={pendingMode === "another"}
          >
            Subir canción
          </Button>
        </div>
      </form>
    </Modal>
  );
}
