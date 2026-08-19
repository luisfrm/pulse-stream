"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { playlistsService } from "@/lib/services/playlists-service";
import { friendlyError } from "@/lib/utils/error";

interface PlaylistActionsProps {
  playlistId: string;
  onMutated: () => Promise<void>;
}

export function PlaylistActions({ playlistId, onMutated }: PlaylistActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("¿Borrar esta playlist?")) return;
    setPending(true);
    setError(null);
    try {
      await playlistsService.delete(playlistId);
      await onMutated();
      router.push("/playlists");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        loading={pending}
        aria-label="Borrar playlist"
      >
        <Trash2 size={16} />
      </Button>
      {error && <span className="text-xs text-brand-200">{error}</span>}
    </div>
  );
}