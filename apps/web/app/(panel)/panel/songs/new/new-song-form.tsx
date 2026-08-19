"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Music2 } from "lucide-react";

import { CoverUploader } from "@/components/cover-uploader";
import { Checkbox, FileInput, Input, Select, Textarea } from "@/components/ui";
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
        <Input
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Ej. De Música Ligera"
        />

        {/* 1) Artista */}
        <fieldset className="flex flex-col text-sm font-medium">
          <legend className="mb-1.5">Artista</legend>
          {createNewArtist ? (
            <Input
              value={newArtistName}
              onChange={(e) => setNewArtistName(e.target.value)}
              placeholder="Nombre del artista nuevo"
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
            <Checkbox
              checked={createNewArtist}
              onCheckedChange={(v) => {
                setCreateNewArtist(v === true);
                setAlbumId("");
              }}
            />
            Crear artista nuevo
          </label>
        </fieldset>

        {/* 2) Álbum del artista */}
        {!createNewArtist && artistId && (
          <fieldset className="flex flex-col text-sm font-medium">
            <legend className="mb-1.5">Álbum</legend>
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
        <fieldset className="flex flex-col text-sm font-medium">
          <legend className="mb-2">Géneros</legend>
          <div className="flex flex-wrap gap-2">
            {initialGenres.map((genre) => (
              <label
                key={genre}
                className="cursor-pointer select-none"
              >
                <Checkbox
                  className="peer absolute size-px opacity-0"
                  checked={selectedGenres.includes(genre)}
                  onCheckedChange={() => toggleGenre(genre)}
                />
                <span
                  className={`inline-flex items-center rounded-pill border px-3 py-1.5 text-sm leading-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400/40 ${selectedGenres.includes(genre)
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

        {/* Colaboradores */}
        {!createNewArtist && artistId && (
          <fieldset className="flex flex-col text-sm font-medium">
            <legend className="mb-2">Colaboradores (opcional)</legend>
            <div className="flex flex-wrap gap-2">
              {initialArtists
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
                        className={`inline-flex items-center rounded-pill border px-3 py-1.5 text-sm leading-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400/40 ${selected
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
          rows={5}
          placeholder="La letra de la canción…"
        />

        <CoverUploader value={coverKey} onChange={setCoverKey} label="Cover (opcional)" />

        <div className="flex flex-col gap-1.5">
          <FileInput
          label="Archivo de audio (.mp3, .aac)"
          icon={<Music2 size={16} />}
          accept="audio/mpeg,.mp3,audio/aac,audio/vnd.dlna.adts,.aac"
          value={file}
          onChange={setFile}
          hint="Formatos MP3 o AAC · máximo 50 MB"
        />
        </div>

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

  return (
    <div className="mt-2 rounded-xl border border-bg-highlight bg-bg-elevated p-3">
      <p className="mb-2 text-xs text-text-subdued">
        Álbum nuevo para <strong className="text-text-primary">{artistName}</strong>:
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del álbum (ej. Bocanada)"
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