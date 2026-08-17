"use client";

import { useCallback, useEffect, useState } from "react";

import { friendlyError, songsApi, type Song } from "@/lib/api-client";

export default function SongsManager({ isAdmin }: { isAdmin: boolean }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    try {
      const page = await songsApi.list(q);
      setSongs(page.items);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    songsApi
      .list()
      .then((page) => {
        if (!cancelled) setSongs(page.items);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onDelete(id: string) {
    if (!confirm("¿Borrar esta canción?")) return;
    setError(null);
    try {
      await songsApi.remove(id);
      await load(search);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="mt-6">
      <div className="flex max-w-md gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(search)}
          placeholder="Buscar canciones…"
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

      {songs.length === 0 ? (
        <p className="mt-10 text-text-subdued">Todavía no hay canciones.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {songs.map((song) => (
            <li
              key={song.id}
              className="rounded-2xl border border-bg-highlight bg-bg-elevated p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold">{song.title}</p>
                  <p className="text-sm text-text-subdued">
                    {song.artist.name}
                    {(song.genres?.length ?? 0) > 0 && (
                      <span className="ml-2">· {song.genres!.join(", ")}</span>
                    )}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onDelete(song.id)}
                    className="shrink-0 rounded-pill px-3 py-1.5 text-sm text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary"
                  >
                    Borrar
                  </button>
                )}
              </div>
              {song.stream_url ? (
                <audio
                  controls
                  preload="none"
                  src={song.stream_url}
                  className="mt-3 h-10 w-full"
                />
              ) : (
                <p className="mt-3 text-xs text-text-subdued">
                  Sin URL de reproducción (R2_PUBLIC_BASE_URL no configurado).
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
