"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { songsService } from "@/lib/services/songs-service";
import type { Artist } from "@/lib/services/types";
import {
  uploadsService,
  uploadToR2,
} from "@/lib/services/uploads-service";
import { friendlyError } from "@/lib/utils/error";

interface NewSongFormProps {
  readonly initialArtists: Artist[];
  readonly initialGenres: string[];
  readonly onCreated: () => Promise<void>;
}

export function NewSongForm({
  initialArtists,
  initialGenres,
  onCreated,
}: NewSongFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState("");
  const [newArtistName, setNewArtistName] = useState("");
  const [createNewArtist, setCreateNewArtist] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Falta el título.");
    if (!file) return setError("Elegí un archivo .mp3 para subir.");

    const artistSpec = createNewArtist
      ? { artist_name: newArtistName.trim() }
      : artistId
        ? { artist_id: artistId }
        : null;
    if (!artistSpec) return setError("Elegí o creá un artista.");

    setPending(true);
    try {
      // 1) Presign + subida directa a R2 (el audio no pasa por la API)
      const presign = await uploadsService.presignUpload(
        file.name,
        file.type || "audio/mpeg",
        file.size,
      );
      await uploadToR2(presign.url, file);

      // 2) Crear la canción con el object_key confirmado
      await songsService.createSong({
        title: title.trim(),
        ...artistSpec,
        genres: selectedGenres,
        lyrics: lyrics.trim() || undefined,
        object_key: presign.object_key,
      });

      // 3) Purgar caché del servidor + refrescar el RSC
      await onCreated();
      router.push("/dashboard/songs");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/dashboard/songs"
        className="text-sm text-text-subdued hover:text-text-primary"
      >
        ← Volver a canciones
      </Link>
      <h1 className="font-display mt-2 text-3xl font-bold">Subir canción</h1>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Título
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Ej. De Música Ligera"
            className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
          />
        </label>

        <fieldset className="flex flex-col gap-1.5 text-sm font-medium">
          <legend>Artista</legend>
          {createNewArtist ? (
            <input
              value={newArtistName}
              onChange={(e) => setNewArtistName(e.target.value)}
              placeholder="Nombre del artista nuevo"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
            />
          ) : (
            <select
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors focus:border-brand-400"
            >
              <option value="">Elegí un artista…</option>
              {initialArtists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          )}
          <label className="mt-2 flex items-center gap-2 text-text-subdued">
            <input
              type="checkbox"
              checked={createNewArtist}
              onChange={(e) => setCreateNewArtist(e.target.checked)}
            />
            Crear artista nuevo
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2 text-sm font-medium">
          <legend>Géneros</legend>
          <div className="flex flex-wrap gap-2">
            {initialGenres.map((genre) => (
              <label
                key={genre}
                className={`cursor-pointer rounded-pill border px-3 py-1.5 text-sm transition-colors ${
                  selectedGenres.includes(genre)
                    ? "border-brand-400 bg-brand-400/20 text-brand-200"
                    : "border-bg-highlight text-text-subdued hover:border-brand-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedGenres.includes(genre)}
                  onChange={() => toggleGenre(genre)}
                />
                {genre}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Letra (opcional)
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={5}
            placeholder="La letra de la canción…"
            className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Archivo de audio (.mp3)
          <input
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm text-text-primary file:mr-3 file:rounded-pill file:border-0 file:bg-brand-400 file:px-4 file:py-2 file:font-semibold file:text-bg-base"
          />
          {file && (
            <span className="text-xs text-text-subdued">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          )}
        </label>

        {error && (
          <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-pill bg-brand-400 px-6 py-3 font-semibold text-bg-base transition-colors hover:bg-brand-200 disabled:opacity-60"
        >
          {pending ? "Subiendo…" : "Subir canción"}
        </button>
      </form>
    </div>
  );
}
