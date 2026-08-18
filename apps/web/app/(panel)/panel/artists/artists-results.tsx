"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CoverUploader } from "@/components/cover-uploader";
import { Button, Input, Modal } from "@/components/ui";
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
 * Hoja cliente: recibe los datos del RSC (initialData) y maneja mutaciones
 * (crear con cover, editar cover, borrar) + estado efímero de UI.
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
  const [deleting, setDeleting] = useState<Artist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCoverId, setEditingCoverId] = useState<string | null>(null);

  const artists = initialArtists;
  const query = initialQuery;
  const currentPage = page;

  async function confirmDelete() {
    if (!deleting) return;
    setPendingId(deleting.id);
    setError(null);
    try {
      await artistsService.deleteArtist(deleting.id);
      setDeleting(null);
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleCoverChange(artist: Artist, coverKey: string | null) {
    setError(null);
    try {
      await artistsService.updateArtist(artist.id, { cover_key: coverKey ?? undefined });
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
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
              className="rounded-2xl border border-bg-highlight bg-bg-elevated p-4"
            >
              <div className="flex items-center gap-4">
                <Link
                  href={`/panel/artists/${artist.id}`}
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40"
                >
                  {artist.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={artist.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                      {artist.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/panel/artists/${artist.id}`}
                    className="block truncate font-display font-bold hover:underline"
                  >
                    {artist.name}
                  </Link>
                  <p className="text-xs text-text-subdued">
                    Creado el{" "}
                    {new Date(artist.created_at).toLocaleDateString("es-AR")}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCoverId(editingCoverId === artist.id ? null : artist.id)
                      }
                      className="mt-1 text-xs text-text-subdued transition-colors hover:text-brand-400"
                    >
                      {editingCoverId === artist.id ? "Cerrar cover" : "Editar cover"}
                    </button>
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={pendingId === artist.id}
                    onClick={() => setDeleting(artist)}
                    className="shrink-0 rounded-pill px-3 py-1.5 text-sm text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary disabled:opacity-50"
                  >
                    {pendingId === artist.id ? "Borrando…" : "Borrar"}
                  </button>
                )}
              </div>

              {editingCoverId === artist.id && (
                <div className="mt-4 border-t border-bg-highlight pt-4">
                  <CoverUploader
                    value={artist.cover_key}
                    previewUrl={artist.cover_url}
                    onChange={(key) => handleCoverChange(artist, key)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-text-subdued">
        Página {currentPage} de {totalPages} · {limit} por página
      </p>

      {/* Confirmación de borrado */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="¿Borrar este artista?"
        description={
          deleting
            ? `"${deleting.name}" se eliminará junto con todas sus canciones. Esta acción no se puede deshacer.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={pendingId === deleting?.id}
            onClick={confirmDelete}
          >
            Sí, eliminar
          </Button>
        </div>
      </Modal>
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
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await artistsService.createArtist(name.trim(), coverKey ?? undefined);
      setName("");
      setCoverKey(null);
      await onRevalidate();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-bg-highlight bg-bg-elevated p-5">
      <h2 className="font-display font-bold">Nuevo artista</h2>
      <form onSubmit={handleSubmit} className="mt-4 flex max-w-md flex-col gap-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del artista (ej. Soda Stereo)"
        />
        <CoverUploader value={coverKey} onChange={setCoverKey} label="Cover (opcional)" />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="w-fit rounded-pill bg-brand-400 px-5 py-2.5 font-semibold text-bg-base transition-colors hover:bg-brand-200 disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear artista"}
        </button>
        {error && (
          <span className="self-center text-sm text-brand-200">{error}</span>
        )}
      </form>
    </div>
  );
}
