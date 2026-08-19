"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";

import { Button, Input, Select, Textarea, type SelectOption } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import type { Playlist } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface PlaylistsManagerProps {
  readonly initialPlaylists: Playlist[];
  readonly onMutated: () => Promise<void>;
}

const QUERY_OPTIONS: SelectOption<QueryValue>[] = [
  {
    value: "top_week",
    label: "Más escuchadas (7 días)",
    hint: "Top de reproducciones de la última semana",
  },
  {
    value: "top_month",
    label: "Más escuchadas (este mes)",
    hint: "Top de reproducciones del mes calendario",
  },
  {
    value: "new",
    label: "Recién agregadas",
    hint: "Las últimas canciones subidas al catálogo",
  },
];

type QueryValue = "top_week" | "top_month" | "new";

/** Genera y administra playlists del sistema (snapshot de queries). */
export function PlaylistsManager({
  initialPlaylists,
  onMutated,
}: PlaylistsManagerProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [query, setQuery] = React.useState<QueryValue>("top_week");
  const [pending, setPending] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!name.trim()) return setError("Falta el nombre de la playlist.");
    setPending(true);
    try {
      const pl = await playlistsService.createSystem({
        name: name.trim(),
        description: description.trim() || undefined,
        query,
      });
      setName("");
      setDescription("");
      setCreated(pl.id);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Borrar esta playlist del sistema?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await playlistsService.delete(id);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
      <form
        onSubmit={handleGenerate}
        className="h-fit rounded-2xl border border-bg-highlight bg-bg-elevated/50 p-5"
      >
        <h2 className="font-display text-lg font-bold">Generar playlist</h2>
        <div className="mt-4 flex flex-col gap-4">
          <Input
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Lo más sonado de la semana"
          />
          <Textarea
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Una línea sobre la lista…"
          />
          <Select<QueryValue>
            label="Fuente"
            options={QUERY_OPTIONS}
            value={query}
            onChange={setQuery}
          />

          {error && (
            <p className="rounded-xl bg-brand-900/30 px-4 py-3 text-sm text-brand-200">
              {error}
            </p>
          )}
          {created && (
            <p className="rounded-xl bg-brand-400/10 px-4 py-3 text-sm text-brand-200">
              Playlist generada ✓ —{" "}
              <Link href={`/playlists/${created}`} className="underline">
                verla
              </Link>
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden /> Generando…
              </>
            ) : (
              <>
                <Sparkles size={16} aria-hidden /> Generar playlist
              </>
            )}
          </Button>
        </div>
      </form>

      <div>
        {initialPlaylists.length === 0 ? (
          <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-10 text-center text-sm text-text-subdued">
            Todavía no hay playlists del sistema. Generá la primera.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {initialPlaylists.map((pl) => (
              <li
                key={pl.id}
                className="flex items-center gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3"
              >
                <Link
                  href={`/playlists/${pl.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
                    {pl.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pl.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-extrabold text-bg-base">
                        {pl.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold hover:underline">
                      {pl.name}
                    </p>
                    <p className="truncate text-xs text-text-subdued">
                      {pl.description || "Curada por el sistema"} · {pl.song_count}{" "}
                      {pl.song_count === 1 ? "canción" : "canciones"}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(pl.id)}
                  disabled={deletingId === pl.id}
                  aria-label={`Borrar ${pl.name}`}
                  className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-brand-900/30 hover:text-brand-200 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
