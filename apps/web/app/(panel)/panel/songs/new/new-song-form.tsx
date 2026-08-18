"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { CoverUploader } from "@/components/cover-uploader";
import { Select } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import { songsService } from "@/lib/services/songs-service";
import type { Album, Artist } from "@/lib/services/types";
import {
  uploadsService,
  uploadToR2,
} from "@/lib/services/uploads-service";
import { friendlyError } from "@/lib/utils/error";
import { formatGenre } from "@/lib/utils/format";

interface NewSongFormProps {
  readonly initialArtists: Artist[];
  readonly initialAlbums: Album[];
  readonly initialGenres: string[];
  readonly initialArtistId?: string;
  readonly initialAlbumId?: string;
  readonly onCreated: () => Promise<void>;
}

/**
 * Flujo de alta: primero el artista (o se crea), después el álbum (o se crea
 * inline para ese artista) y recién ahí los datos de la canción.
 */
export function NewSongForm({
  initialArtists,
  initialAlbums,
  initialGenres,
  initialArtistId = "",
  initialAlbumId = "",
  onCreated,
}: NewSongFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState(initialArtistId);
  const [newArtistName, setNewArtistName] = useState("");
  const [createNewArtist, setCreateNewArtist] = useState(false);
  const [albumId, setAlbumId] = useState(initialAlbumId);
  const [albumCreateOpen, setAlbumCreateOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Álbumes del artista elegido (el álbum pertenece al mismo artista).
  const artistAlbums = artistId
    ? initialAlbums.filter((a) => a.artist.id === artistId)
    : [];
  const artistOptions = initialArtists.map((a) => ({ value: a.id, label: a.name }));
  const albumOptions = artistAlbums.map((a) => ({ value: a.id, label: a.title }));

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

  function handleArtistChange(id: string) {
    setArtistId(id);
    setAlbumId("");
    setAlbumCreateOpen(false);
  }

  async function handleCreateAlbum(title: string, coverKey: string | null) {
    if (!artistId) return;
    const album = await albumsService.create({
      title,
      artist_id: artistId,
      ...(coverKey ? { cover_key: coverKey } : {}),
    });
    setAlbumId(album.id);
    setAlbumCreateOpen(false);
    await onCreated();
    router.refresh();
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

    if (!createNewArtist && !albumId) {
      return setError("El flujo requiere un álbum: elegí uno o crealo para el artista.");
    }

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
        ...(albumId ? { album_id: albumId } : {}),
        genres: selectedGenres,
        lyrics: lyrics.trim() || undefined,
        object_key: presign.object_key,
        ...(coverKey ? { cover_key: coverKey } : {}),
        ...(collaboratorIds.length > 0
          ? { collaborator_ids: collaboratorIds }
          : {}),
      });

      // 3) Purgar caché del servidor + refrescar el RSC
      await onCreated();
      router.push("/panel/songs");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/panel/songs"
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
            className={inputClass}
          />
        </label>

        {/* 1) Artista */}
        <fieldset className="flex flex-col gap-1.5 text-sm font-medium">
          <legend>Artista</legend>
          {createNewArtist ? (
            <input
              value={newArtistName}
              onChange={(e) => setNewArtistName(e.target.value)}
              placeholder="Nombre del artista nuevo"
              className={inputClass}
            />
          ) : (
            <Select
              options={artistOptions}
              value={artistId}
              onChange={handleArtistChange}
              placeholder="Elegí un artista…"
              searchable
            />
          )}
          <label className="mt-1 flex items-center gap-2 text-text-subdued">
            <input
              type="checkbox"
              checked={createNewArtist}
              onChange={(e) => {
                setCreateNewArtist(e.target.checked);
                setAlbumId("");
              }}
            />
            Crear artista nuevo
          </label>
        </fieldset>

        {/* 2) Álbum del artista */}
        {!createNewArtist && artistId && (
          <fieldset className="flex flex-col gap-1.5 text-sm font-medium">
            <legend>Álbum</legend>
            <Select
              options={albumOptions}
              value={albumId}
              onChange={setAlbumId}
              placeholder={
                artistAlbums.length === 0
                  ? "Este artista no tiene álbumes"
                  : "Elegí un álbum…"
              }
              emptyLabel="Este artista no tiene álbumes todavía"
              searchable
            />
            <button
              type="button"
              onClick={() => setAlbumCreateOpen((o) => !o)}
              className="mt-1 w-fit text-xs font-medium text-brand-400 transition-colors hover:text-brand-200"
            >
              {albumCreateOpen ? "Cancelar creación" : "+ Crear álbum para este artista"}
            </button>

            {albumCreateOpen && (
              <CreateAlbumInline
                artistName={
                  initialArtists.find((a) => a.id === artistId)?.name ?? "el artista"
                }
                onCreated={handleCreateAlbum}
              />
            )}
          </fieldset>
        )}

        {/* 3) Géneros */}
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
                {formatGenre(genre)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Colaboradores */}
        {!createNewArtist && artistId && (
          <fieldset className="flex flex-col gap-2 text-sm font-medium">
            <legend>Colaboradores (opcional)</legend>
            <div className="flex flex-wrap gap-2">
              {initialArtists
                .filter((a) => a.id !== artistId)
                .map((artist) => {
                  const selected = collaboratorIds.includes(artist.id);
                  return (
                    <label
                      key={artist.id}
                      className={`cursor-pointer rounded-pill border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? "border-brand-400 bg-brand-400/20 text-brand-200"
                          : "border-bg-highlight text-text-subdued hover:border-brand-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleCollaborator(artist.id)}
                      />
                      {artist.name}
                    </label>
                  );
                })}
            </div>
          </fieldset>
        )}

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Letra (opcional)
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={5}
            placeholder="La letra de la canción…"
            className={inputClass}
          />
        </label>

        <CoverUploader value={coverKey} onChange={setCoverKey} label="Cover (opcional)" />

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
          {pending ? (
            <>
              <Loader2 size={16} className="mr-1 inline animate-spin" aria-hidden />
              Subiendo…
            </>
          ) : (
            "Subir canción"
          )}
        </button>
      </form>
    </div>
  );
}

function CreateAlbumInline({
  artistName,
  onCreated,
}: {
  artistName: string;
  onCreated: (title: string, coverKey: string | null) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return setError("Falta el título del álbum.");
    setPending(true);
    setError(null);
    try {
      await onCreated(title.trim(), coverKey);
      setTitle("");
      setCoverKey(null);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400";

  return (
    <div className="mt-2 rounded-xl border border-bg-highlight bg-bg-elevated p-3">
      <p className="mb-2 text-xs text-text-subdued">
        Álbum nuevo para <strong className="text-text-primary">{artistName}</strong>:
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del álbum (ej. Bocanada)"
          className={inputClass}
        />
        <CoverUploader value={coverKey} onChange={setCoverKey} label="Cover (opcional)" />
        {error && (
          <p className="rounded-xl bg-brand-900/30 px-3 py-2 text-xs text-brand-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-pill bg-brand-400 px-4 py-2 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200 disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear y elegir este álbum"}
        </button>
      </form>
    </div>
  );
}