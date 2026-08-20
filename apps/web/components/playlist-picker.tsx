"use client";

import * as React from "react";
import { Check, ListPlus, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BottomSheet, Button, Input, Textarea, cn } from "@/components/ui";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { playlistsService } from "@/lib/services/playlists-service";
import type { MyPlaylist, Song } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface PlaylistPickerProps {
  song: Song;
  /** Playlists del usuario (GET /me/playlists) con `song_ids` por posición. */
  playlists: MyPlaylist[];
  onMutated?: () => Promise<void>;
  /** Clases extra para el botón disparador (icon-button del contexto). */
  triggerClassName?: string;
}

/**
 * Dropdown "+" de "agregar a playlist": popover en desktop, BottomSheet en
 * mobile (mismo contenido, dos superficies). Lista las playlists del usuario
 * con su cantidad de canciones y permite crear una nueva (crear + agregar)
 * sin salir del flujo. Los errores se muestran con `friendlyError` y el
 * éxito con un toast de sonner.
 */
export function PlaylistPicker({
  song,
  playlists,
  onMutated,
  triggerClassName,
}: PlaylistPickerProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [createPending, setCreatePending] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Desktop: cierre con click fuera y Escape (el BottomSheet lo maneja solo).
  React.useEffect(() => {
    if (isMobile || !open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobile, open]);

  function resetCreate() {
    setCreating(false);
    setNewName("");
    setNewDesc("");
  }

  function close() {
    setOpen(false);
    setError(null);
    resetCreate();
  }

  async function handleTogglePlaylist(pl: MyPlaylist) {
    if (pendingId) return;
    const containsSong = pl.song_ids?.includes(song.id) ?? false;
    setPendingId(pl.id);
    setError(null);
    try {
      if (containsSong) {
        await playlistsService.removeSong(pl.id, song.id);
        close();
        await onMutated?.();
        router.refresh();
        toast.success(`Quitada de «${pl.name}»`);
      } else {
        await playlistsService.addSong(pl.id, song.id);
        close();
        await onMutated?.();
        router.refresh();
        toast.success(`Agregada a «${pl.name}»`);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatePending(true);
    setError(null);
    try {
      const pl = await playlistsService.create({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      await playlistsService.addSong(pl.id, song.id);
      close();
      await onMutated?.();
      router.refresh();
      toast.success(`Playlist «${pl.name}» creada con la canción`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCreatePending(false);
    }
  }

  const content = (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-xl bg-brand-900/30 px-3.5 py-2.5 text-sm text-brand-200">
          {error}
        </p>
      )}

      {creating ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 p-2">
          <Input
            label="Nombre"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej. Mis favoritas del viaje"
            autoFocus
            required
          />
          <Textarea
            label="Descripción (opcional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
            placeholder="Una playlist para…"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetCreate}
            >
              Volver
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={createPending}
              disabled={!newName.trim()}
            >
              Crear y agregar
            </Button>
          </div>
        </form>
      ) : (
        <>
          {playlists.length === 0 ? (
            <p className="px-2 py-3 text-sm text-text-subdued">
              Todavía no tenés playlists.
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {playlists.map((pl) => {
                // `song_ids` llega en el objeto playlist (GET /me/playlists):
                // sin fetch extra por playlist. Click = toggle: si ya la
                // contiene la quita; si no, la agrega.
                const containsSong = pl.song_ids?.includes(song.id) ?? false;
                return (
                  <li key={pl.id}>
                    <button
                      type="button"
                      onClick={() => handleTogglePlaylist(pl)}
                      disabled={pendingId === pl.id}
                      aria-pressed={containsSong || undefined}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-bg-highlight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{pl.name}</span>
                        <span className="block text-xs text-text-subdued">
                          {containsSong
                            ? "Ya está en esta playlist"
                            : `${pl.song_count} ${
                                pl.song_count === 1 ? "canción" : "canciones"
                              }`}
                        </span>
                      </span>
                      {containsSong ? (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-bg-base"
                          aria-hidden
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : pendingId === pl.id ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : (
                        <span
                          className="h-5 w-5 shrink-0 rounded-full border border-bg-highlight"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-bg-highlight pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCreating(true)}
            >
              <Plus size={16} /> Nueva playlist
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const trigger = (
    <button
      type="button"
      onClick={() => {
        setOpen((o) => !o);
        setError(null);
      }}
      aria-label="Agregar a playlist"
      aria-expanded={open}
      className={cn(
        "rounded-pill p-2 text-text-subdued transition-colors hover:text-brand-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
        triggerClassName
      )}
    >
      <ListPlus size={18} />
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <BottomSheet open={open} onClose={close} title="Agregar a playlist">
          {content}
        </BottomSheet>
      </>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {open && (
        <div className="animate-dropdown-in absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-bg-highlight bg-bg-elevated p-2 shadow-2xl">
          {content}
        </div>
      )}
    </div>
  );
}
