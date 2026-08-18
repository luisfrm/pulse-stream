"use client";

import * as React from "react";
import { useState } from "react";

import { Button, Modal, Input, Select, Textarea } from "@/components/ui";
import { songsService } from "@/lib/services/songs-service";
import type { Album, Artist, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";
import { formatGenre } from "@/lib/utils/format";

interface SongEditDialogProps {
  /** Canción a editar (null = cerrado). */
  song: Song | null;
  /** Géneros disponibles del catálogo (valores planos, ej. "hip-hop"). */
  genres: string[];
  /** Álbumes del catálogo (para asignar; se filtran por el artista de la canción). */
  albums: Album[];
  /** Artistas del catálogo (para elegir colaboradores). */
  artists: Artist[];
  onClose: () => void;
  /** Se llama tras guardar con éxito (revalidar + refrescar el RSC). */
  onSaved: () => Promise<void>;
}

/** Diálogo para editar los metadatos de una canción (título, álbum, géneros,
 * colaboradores, letra). */
export function SongEditDialog({
  song,
  genres,
  albums,
  artists,
  onClose,
  onSaved,
}: SongEditDialogProps) {
  // El padre lo remonta por canción (key={song.id}): el estado se inicializa
  // desde `song` sin necesidad de sincronizar por efecto.
  const [title, setTitle] = useState(song?.title ?? "");
  const [albumId, setAlbumId] = useState(song?.album?.id ?? "");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(song?.genres ?? []);
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>(
    song?.collaborators?.map((c) => c.id) ?? []
  );
  const [lyrics, setLyrics] = useState(song?.lyrics ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Álbumes del artista principal de la canción
  const artistAlbums = song
    ? albums.filter((a) => a.artist.id === song.artist.id)
    : [];
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!song) return;
    if (!title.trim()) return setError("El título no puede quedar vacío.");

    setPending(true);
    setError(null);
    try {
      await songsService.updateSong(song.id, {
        title: title.trim(),
        // "" -> undefined (no tocar); "none" -> null (quitar álbum)
        ...(albumId !== song.album?.id
          ? { album_id: albumId === "" ? null : albumId }
          : {}),
        genres: selectedGenres,
        lyrics: lyrics.trim() || undefined,
        collaborator_ids: collaboratorIds,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={song !== null}
      onClose={onClose}
      title="Editar canción"
      description={song ? `Editá los metadatos de "${song.title}".` : undefined}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre de la canción"
        />

        <Select
          label="Álbum"
          options={albumOptions}
          value={albumId}
          onChange={setAlbumId}
          placeholder={
            artistAlbums.length === 0 ? "Sin álbumes de este artista" : "Sin álbum"
          }
          emptyLabel="Este artista no tiene álbumes"
        />

        <fieldset className="flex flex-col gap-2 text-sm font-medium">
          <legend>Géneros</legend>
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => {
              const selected = selectedGenres.includes(genre);
              return (
                <label
                  key={genre}
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
                    onChange={() => toggleGenre(genre)}
                  />
                  {formatGenre(genre)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2 text-sm font-medium">
          <legend>Colaboradores</legend>
          <div className="flex flex-wrap gap-2">
            {artists
              .filter((a) => a.id !== song?.artist.id)
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

        <Textarea
          label="Letra (opcional)"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={5}
          placeholder="La letra de la canción…"
        />

        {error && (
          <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  );
}
