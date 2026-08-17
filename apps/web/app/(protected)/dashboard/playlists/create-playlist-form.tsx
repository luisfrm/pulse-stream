"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, CardContent, Input, Textarea } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import { friendlyError } from "@/lib/utils/error";

interface CreatePlaylistFormProps {
  onCreated: () => Promise<void>;
}

/** Tarjeta "Nueva playlist" (estado efímero de UI; muta vía service). */
export function CreatePlaylistForm({ onCreated }: CreatePlaylistFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const pl = await playlistsService.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await onCreated();
      router.push(`/dashboard/playlists/${pl.id}`);
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-bg-highlight text-text-subdued transition-colors hover:border-brand-400 hover:text-brand-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
      >
        <Plus size={20} />
        <span className="text-sm font-medium">Nueva playlist</span>
      </button>
    );
  }

  return (
    <Card className="border-brand-400/40">
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Para el gimnasio"
            autoFocus
            required
          />
          <Textarea
            label="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="De qué se trata esta playlist…"
          />
          {error && (
            <p className="rounded-xl bg-brand-900/30 px-3 py-2 text-sm text-brand-200">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={!name.trim()}>
              Crear
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
