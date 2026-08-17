"use client";

import * as React from "react";
import { useState } from "react";

import { Button, Dialog, Input, Textarea } from "@/components/ui";
import { songsService } from "@/lib/services/songs-service";
import type { Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";
import { formatGenre } from "@/lib/utils/format";

interface SongEditDialogProps {
  /** Canción a editar (null = cerrado). */
  song: Song | null;
  /** Géneros disponibles del catálogo (valores planos, ej. "hip-hop"). */
  genres: string[];
  onClose: () => void;
  /** Se llama tras guardar con éxito (revalidar + refrescar el RSC). */
  onSaved: () => Promise<void>;
}

/** Diálogo para editar los metadatos de una canción (título, géneros, letra). */
export function SongEditDialog({ song, genres, onClose, onSaved }: SongEditDialogProps) {
  // El padre lo remonta por canción (key={song.id}): el estado se inicializa
  // desde `song` sin necesidad de sincronizar por efecto.
  const [title, setTitle] = useState(song?.title ?? "");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(song?.genres ?? []);
  const [lyrics, setLyrics] = useState(song?.lyrics ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
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
        genres: selectedGenres,
        lyrics: lyrics.trim() || undefined,
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
    <Dialog
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
    </Dialog>
  );
}