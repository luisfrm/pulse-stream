"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PlaylistCover } from "@/components/playlist-cover";
import {
  Button,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
  type SelectOption,
} from "@/components/ui";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { playlistsService } from "@/lib/services/playlists-service";
import { songsService } from "@/lib/services/songs-service";
import type { Playlist, PlaylistDetail, Song } from "@/lib/services/types";
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
  const [playlistToDelete, setPlaylistToDelete] =
    React.useState<Playlist | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<Record<string, PlaylistDetail>>(
    {}
  );
  const [loadingDetailId, setLoadingDetailId] = React.useState<string | null>(
    null
  );

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

  async function handleDelete() {
    if (!playlistToDelete) return;
    setDeletingId(playlistToDelete.id);
    try {
      await playlistsService.delete(playlistToDelete.id);
      setPlaylistToDelete(null);
      await onMutated().catch(() => {});
      router.refresh();
    } catch (err) {
      toast.error(friendlyError(err));
      setPlaylistToDelete(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function loadDetail(id: string) {
    setLoadingDetailId(id);
    try {
      const detail = await playlistsService.getPlaylistById(id);
      setDetails((prev) => ({ ...prev, [id]: detail }));
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      // Funcional: si el usuario expandió otra playlist mientras cargaba esta,
      // no se limpia el indicador de la nueva.
      setLoadingDetailId((cur) => (cur === id ? null : cur));
    }
  }

  function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // Lazy: solo la primera vez. El detalle queda cacheado por playlist.
    if (!details[id]) void loadDetail(id);
  }

  async function reloadDetail(id: string, detail?: PlaylistDetail) {
    // addSong/removeSong ya devuelven el detalle actualizado: si viene, no se
    // re-pide (ahorra un request por click de curation).
    const fresh = detail ?? (await playlistsService.getPlaylistById(id));
    setDetails((prev) => ({ ...prev, [id]: fresh }));
    await onMutated();
    router.refresh();
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
            {initialPlaylists.map((pl) => {
              const songCount =
                details[pl.id]?.song_count ?? pl.song_count;
              return (
              <li
                key={pl.id}
                className="rounded-2xl border border-bg-highlight bg-bg-elevated"
              >
                <div className="flex items-center gap-3 p-3">
                  <Link
                    href={`/playlists/${pl.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
                      <PlaylistCover
                        coverUrl={pl.cover_url}
                        collageUrls={pl.collage_cover_urls}
                        size="md"
                        sizes="48px"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold hover:underline">
                        {pl.name}
                      </p>
                      <p className="truncate text-xs text-text-subdued">
                        {pl.description || "Curada por el sistema"} · {songCount}{" "}
                        {songCount === 1 ? "canción" : "canciones"}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleDetail(pl.id)}
                    aria-expanded={expandedId === pl.id}
                    className="flex shrink-0 items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-medium text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary"
                  >
                    Canciones
                    <ChevronDown
                      size={15}
                      aria-hidden
                      className={cn(
                        "transition-transform",
                        expandedId === pl.id && "rotate-180"
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaylistToDelete(pl)}
                    disabled={deletingId === pl.id}
                    aria-label={`Borrar ${pl.name}`}
                    className="rounded-pill p-2 text-text-subdued transition-colors hover:bg-brand-900/30 hover:text-brand-200 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {expandedId === pl.id && (
                  <div className="px-3 pb-3">
                    {loadingDetailId === pl.id && !details[pl.id] ? (
                      <p className="border-t border-bg-highlight pt-3 text-sm text-text-subdued">
                        Cargando canciones…
                      </p>
                    ) : details[pl.id] ? (
                      <PlaylistCuration
                        playlistId={pl.id}
                        detail={details[pl.id]}
                        onReload={(detail) => reloadDetail(pl.id, detail)}
                      />
                    ) : null}
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirm system playlist deletion */}
      <Modal
        open={playlistToDelete !== null}
        onClose={() => {
          if (!deletingId) setPlaylistToDelete(null);
        }}
        title="¿Borrar esta playlist del sistema?"
        description={
          playlistToDelete
            ? `"${playlistToDelete.name}" se eliminará de forma permanente. Esta acción no se puede deshacer.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={deletingId !== null}
            onClick={() => setPlaylistToDelete(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={deletingId !== null}
            onClick={handleDelete}
          >
            Sí, eliminar
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** Detalle expandible: quitar/agregar canciones de una playlist del sistema. */
function PlaylistCuration({
  playlistId,
  detail,
  onReload,
}: {
  playlistId: string;
  detail: PlaylistDetail;
  onReload: (detail?: PlaylistDetail) => Promise<void>;
}) {
  const [search, setSearch] = React.useState("");
  const debounced = useDebounce(search, 300);
  const [results, setResults] = React.useState<Song[]>([]);
  const [songToRemove, setSongToRemove] = React.useState<Song | null>(null);
  const [pendingSongId, setPendingSongId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const query = debounced.trim();
    // Sin setState síncrono en el effect (regla de lint): si el query es corto
    // el render oculta los resultados vía `activeQuery`, sin limpiar estado.
    // El "Buscando…" se deriva de la ventana del debounce (`pending`).
    if (query.length < 2) return;
    let alive = true;
    songsService
      .getSongs({ query, limit: 10 })
      .then((page) => {
        if (alive) setResults(page.items);
      })
      .catch(() => {
        if (alive) setResults([]);
      });
    return () => {
      alive = false;
    };
  }, [debounced]);

  async function handleRemove() {
    const target = songToRemove;
    if (!target || pendingSongId) return;
    setPendingSongId(target.id);
    try {
      // removeSong ya devuelve el detalle actualizado: se pasa directo a
      // onReload (sin refetch).
      const updated = await playlistsService.removeSong(playlistId, target.id);
      toast.success(`Quitada «${target.title}»`);
      setSongToRemove(null);
      await onReload(updated).catch(() => {});
    } catch (err) {
      toast.error(friendlyError(err));
      setSongToRemove(null);
    } finally {
      setPendingSongId((cur) => (cur === target.id ? null : cur));
    }
  }

  async function handleAdd(song: Song) {
    if (pendingSongId) return;
    setPendingSongId(song.id);
    try {
      const updated = await playlistsService.addSong(playlistId, song.id);
      toast.success(`Agregada «${song.title}»`);
      // No se limpia la búsqueda: la canción agregada desaparece sola de los
      // resultados (la filtra `existingIds` del detalle recién actualizado),
      // así se pueden agregar varias seguidas del mismo query.
      await onReload(updated);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setPendingSongId((cur) => (cur === song.id ? null : cur));
    }
  }

  const songs = detail.songs ?? [];
  const existingIds = new Set(songs.map((song) => song.id));
  // Mientras el query debounced es corto (o se borró la búsqueda) no se
  // muestran resultados viejos — derivado en el render, no con setState.
  // Se mira TAMBIÉN el valor vivo del input: así al borrar la búsqueda los
  // resultados desaparecen inmediato (sin esperar la ventana del debounce).
  const activeQuery =
    debounced.trim().length >= 2 && search.trim().length >= 2;
  const available = activeQuery
    ? results.filter((song) => !existingIds.has(song.id))
    : [];
  // Ventana del debounce: el usuario escribió pero el query aún no disparó.
  const pending = search.trim().length >= 2 && search !== debounced;

  return (
    <div className="border-t border-bg-highlight pt-3">
      {songs.length === 0 ? (
        <p className="rounded-xl border border-bg-highlight bg-bg-elevated/50 px-4 py-5 text-center text-sm text-text-subdued">
          Sin canciones todavía. Agregalas de a una o resembrá desde la página
          del artista.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {songs.map((song) => (
            <li
              key={song.id}
              className="flex items-center gap-3 rounded-lg bg-bg-elevated/60 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{song.title}</span>
                <span className="block truncate text-xs text-text-subdued">
                  {song.artist.name}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSongToRemove(song)}
                disabled={pendingSongId === song.id}
                className="shrink-0 rounded-pill px-3 py-1 text-xs text-text-subdued transition-colors hover:bg-brand-900/30 hover:text-brand-200 disabled:opacity-50"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Input
          label="Agregar canción"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título…"
        />
        {pending && (
          <p className="mt-2 text-xs text-text-subdued">Buscando…</p>
        )}
        {available.length > 0 && (
          <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {available.map((song) => (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(song)}
                  disabled={pendingSongId === song.id}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-highlight disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {song.title}
                  </span>
                  <span className="shrink-0 text-xs text-text-subdued">
                    {song.artist.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirm song removal from playlist */}
      <Modal
        open={songToRemove !== null}
        onClose={() => {
          if (!pendingSongId) setSongToRemove(null);
        }}
        title="¿Quitar canción de la playlist?"
        description={
          songToRemove
            ? `«${songToRemove.title}» se quitará de esta playlist.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={pendingSongId !== null}
            onClick={() => setSongToRemove(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={pendingSongId !== null}
            onClick={handleRemove}
          >
            Sí, quitar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
