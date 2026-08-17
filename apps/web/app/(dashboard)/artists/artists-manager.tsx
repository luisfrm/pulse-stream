"use client";

import { useCallback, useEffect, useState } from "react";

import { artistsApi, friendlyError, type Artist } from "@/lib/api-client";

export default function ArtistsManager({ isAdmin }: { isAdmin: boolean }) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async (q?: string) => {
    try {
      const page = await artistsApi.list(q);
      setArtists(page.items);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    artistsApi
      .list()
      .then((page) => {
        if (!cancelled) setArtists(page.items);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await artistsApi.create(name.trim());
      setName("");
      await load(search);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Borrar este artista? Se borrarán sus canciones.")) return;
    setError(null);
    try {
      await artistsApi.remove(id);
      await load(search);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Artistas</h1>

      {isAdmin && (
        <form onSubmit={onCreate} className="mt-6 flex max-w-md gap-3">
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
        </form>
      )}

      <div className="mt-6 flex max-w-md gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="Buscar artistas…"
          className="flex-1 rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-text-primary outline-none transition-colors placeholder:text-text-subdued focus:border-brand-400"
        />
        <button
          type="button"
          onClick={() => load(search)}
          className="rounded-pill border border-bg-highlight px-5 py-3 font-semibold text-text-primary transition-colors hover:border-brand-400"
        >
          Buscar
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
          {error}
        </p>
      )}

      {artists.length === 0 ? (
        <p className="mt-10 text-text-subdued">Todavía no hay artistas.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
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
                  onClick={() => onDelete(artist.id)}
                  className="rounded-pill px-3 py-1.5 text-sm text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary"
                >
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
