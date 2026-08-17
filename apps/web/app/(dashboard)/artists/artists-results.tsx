"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { artistsService } from "@/lib/services/artists-service";
import type { Artist } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface ArtistsResultsProps {
  readonly initialArtists: Artist[];
  readonly initialQuery: string;
  readonly page: number;
  readonly totalPages: number;
  readonly limit: number;
  readonly isAdmin: boolean;
  readonly onRevalidate: () => Promise<void>;
}

/**
 * Hoja cliente: NO fetchea. Recibe los datos del RSC (initialData) y solo
 * maneja mutaciones (borrar) + estado efímero de UI.
 */
export function ArtistsResults({
  initialArtists,
  initialQuery,
  page,
  totalPages,
  limit,
  isAdmin,
  onRevalidate,
}: ArtistsResultsProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const artists = initialArtists;
  const query = initialQuery;
  const currentPage = page;

  async function handleDelete(id: string) {
    if (!confirm("¿Borrar este artista? Se borrarán sus canciones.")) return;
    setPendingId(id);
    setError(null);
    try {
      await artistsService.deleteArtist(id);
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-4 rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
          {error}
        </p>
      )}

      {isAdmin && <CreateArtistForm onRevalidate={onRevalidate} />}

      {artists.length === 0 ? (
        <p className="mt-10 text-text-subdued">
          {query ? "Sin resultados para tu búsqueda." : "Todavía no hay artistas."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {artists.map((artist) => (
            <li
              key={artist.id}
              className="flex items-center justify-between rounded-2xl border border-bg-highlight bg-bg-elevated px-5 py-4"
            >
              <div>
                <p className="font-display font-bold">{artist.name}</p>
                <p className="text-xs text-text-subdued">
                  Creado el{" "}
                  {new Date(artist.created_at).toLocaleDateString("es-AR")}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={pendingId === artist.id}
                  onClick={() => handleDelete(artist.id)}
                  className="rounded-pill px-3 py-1.5 text-sm text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary disabled:opacity-50"
                >
                  {pendingId === artist.id ? "Borrando…" : "Borrar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-text-subdued">
        Página {currentPage} de {totalPages} · {limit} por página
      </p>
    </div>
  );
}

function CreateArtistForm({
  onRevalidate,
}: {
  onRevalidate: () => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await artistsService.createArtist(name.trim());
      setName("");
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex max-w-md gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del artista (ej. Soda Stereo)"
        className="flex-1 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="rounded-pill bg-brand-400 px-5 py-3 font-semibold text-bg-base transition-colors hover:bg-brand-200 disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear"}
      </button>
      {error && (
        <span className="self-center text-sm text-brand-200">{error}</span>
      )}
    </form>
  );
}
