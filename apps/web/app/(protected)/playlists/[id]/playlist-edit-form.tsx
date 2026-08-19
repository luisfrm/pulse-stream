"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button, Checkbox, Input, Modal, Textarea } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import type { PlaylistDetail } from "@/lib/services/types";
import { friendlyError } from "@/lib/utils/error";

interface PlaylistEditFormProps {
  playlist: PlaylistDetail;
  onMutated: () => Promise<void>;
}

/**
 * Edición de playlist propia (PATCH /playlists/{id}): nombre, descripción y
 * visibilidad. Solo se muestra para `kind === "user"` — las `system` no son
 * mutables por el front (el backend ya lo restringe con `_get_mutable`).
 */
export function PlaylistEditForm({ playlist, onMutated }: PlaylistEditFormProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(playlist.name);
  const [description, setDescription] = React.useState(playlist.description ?? "");
  const [isPublic, setIsPublic] = React.useState(playlist.is_public);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Al abrir, sincroniza con los valores actuales del server (en el handler,
  // no en un effect: evita renders en cascada).
  function openForm() {
    setName(playlist.name);
    setDescription(playlist.description ?? "");
    setIsPublic(playlist.is_public);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await playlistsService.update(playlist.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        is_public: isPublic,
      });
      setOpen(false);
      await onMutated();
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={openForm}
        aria-label="Editar playlist"
      >
        <Pencil size={16} /> Editar
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar playlist"
        description="Nombre, descripción y visibilidad."
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <Textarea
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="De qué se trata esta playlist…"
          />
          <label className="flex items-center gap-2.5 text-sm font-medium">
            <Checkbox
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(v === true)}
            />
            Playlist pública
          </label>
          {error && (
            <p className="rounded-xl bg-brand-900/30 px-3 py-2 text-sm text-brand-200">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={!name.trim()}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}