"use client";

import * as React from "react";
import { Check, Download, Loader2 } from "lucide-react";

import type { Song } from "@/lib/services/types";
import {
  hasSong,
  saveSong,
  removeSong,
  canCacheOffline,
} from "@/lib/offline";
import { cn } from "@/components/ui";

interface OfflineButtonProps {
  song: Song;
  className?: string;
  /** Label descriptivo (para usar dentro del reproductor fullscreen). */
  withLabel?: boolean;
  /** Modo icono compacto (filas/cards): sin borde ni label, estilo icon-button. */
  compact?: boolean;
}

/** Botón "descargar para escuchar offline": guarda el audio en la Cache API. */
export function OfflineButton({
  song,
  className,
  withLabel,
  compact,
}: OfflineButtonProps) {
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    // Solo dependemos de la identidad de la canción; hasSong la reconstruye.
    hasSong({ id: song.id, stream_url: song.stream_url } as Song)
      .then((v) => alive && setSaved(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [song.id, song.stream_url]);

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (saved) {
        await removeSong(song);
        setSaved(false);
      } else {
        if (!canCacheOffline()) throw new Error("Tu navegador no soporta esto");
        await saveSong(song);
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar");
    } finally {
      setPending(false);
    }
  }

  const label = saved ? "Quitar descarga offline" : "Descargar para escuchar offline";

  return (
    <span className={cn("inline-flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={label}
        title={error ?? (saved ? "Guardada para escuchar offline" : "Descargar para escuchar offline")}
        className={cn(
          compact
            ? "rounded-pill p-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-50"
            : "flex items-center gap-2 rounded-pill border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50",
          compact
            ? saved
              ? "text-brand-400"
              : "text-text-subdued hover:text-brand-400"
            : saved
              ? "border-brand-400/60 bg-brand-900/30 text-brand-200"
              : "border-bg-highlight bg-bg-elevated text-text-subdued hover:border-brand-400 hover:text-text-primary"
        )}
      >
        {pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : saved ? (
          <Check size={16} />
        ) : (
          <Download size={16} />
        )}
        {withLabel && !compact && <span>{saved ? "Descargada" : "Descargar"}</span>}
      </button>
      {error && !compact && (
        <span className="max-w-[12rem] text-center text-xs text-brand-200">{error}</span>
      )}
    </span>
  );
}
