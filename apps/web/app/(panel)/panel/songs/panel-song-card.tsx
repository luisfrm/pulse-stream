"use client";

import * as React from "react";
import Link from "next/link";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";

import { AudioPreviewPlayer } from "@/components/audio-preview-player";
import { CoverUploader } from "@/components/cover-uploader";
import { Badge, cn } from "@/components/ui";
import type { Song } from "@/lib/services/types";
import { formatGenre } from "@/lib/utils/format";

interface PanelSongCardProps {
  song: Song;
  pending: boolean;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
  onCoverChange: (song: Song, coverKey: string | null) => Promise<void>;
}

/** Card de canción del panel: cover, metadatos, preview y acciones admin. */
export function PanelSongCard({
  song,
  pending,
  onEdit,
  onDelete,
  onCoverChange,
}: PanelSongCardProps) {
  const [coverOpen, setCoverOpen] = React.useState(false);

  return (
    <li className="card-lift flex flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-4">
      {/* Cover (cuadrado, tipo grid de streaming) */}
      <Link
        href={`/song/${song.id}`}
        className="relative block aspect-square w-full overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40"
      >
        {song.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={song.cover_url}
            alt={`Cover de ${song.title}`}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
          />
        ) : (
          <span className="bg-brand-gradient flex h-full w-full items-center justify-center font-display text-5xl font-extrabold text-bg-base">
            {song.title.charAt(0).toUpperCase()}
          </span>
        )}
      </Link>

      {/* Metadatos */}
      <div className="min-w-0">
        <Link
          href={`/song/${song.id}`}
          className="block truncate font-display text-base font-bold transition-colors hover:text-brand-400"
        >
          {song.title}
        </Link>
        <Link
          href={`/artist/${song.artist.id}`}
          className="mt-0.5 block truncate text-sm text-text-subdued transition-colors hover:text-text-primary"
        >
          {song.artist.name}
        </Link>
        {(song.genres?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {song.genres!.slice(0, 3).map((genre) => (
              <Badge key={genre} variant="glass" size="sm">
                {formatGenre(genre)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Preview personalizado */}
      {song.stream_url ? (
        <AudioPreviewPlayer src={song.stream_url} title={song.title} />
      ) : (
        <p className="rounded-xl bg-bg-highlight/40 px-3 py-2 text-xs text-text-subdued">
          Sin URL de reproducción (R2_PUBLIC_BASE_URL no configurado).
        </p>
      )}

      {/* Acciones admin */}
      <div className="mt-auto flex items-center gap-2 border-t border-bg-highlight pt-3">
        <button
          type="button"
          onClick={() => onEdit(song)}
          className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium text-text-subdued transition-colors hover:bg-bg-highlight hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <Pencil size={13} /> Editar
        </button>
        <button
          type="button"
          onClick={() => setCoverOpen((o) => !o)}
          aria-expanded={coverOpen}
          className={cn(
            "flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
            coverOpen
              ? "bg-bg-highlight text-text-primary"
              : "text-text-subdued hover:bg-bg-highlight hover:text-text-primary"
          )}
        >
          <ImagePlus size={13} /> {coverOpen ? "Cerrar cover" : "Editar cover"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onDelete(song)}
          className="ml-auto flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium text-text-subdued transition-colors hover:bg-brand-900/40 hover:text-brand-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400 disabled:opacity-50"
        >
          <Trash2 size={13} /> {pending ? "Borrando…" : "Borrar"}
        </button>
      </div>

      {coverOpen && (
        <div className="border-t border-bg-highlight pt-3">
          <CoverUploader
            value={song.cover_key}
            previewUrl={song.cover_url}
            onChange={(key) => onCoverChange(song, key)}
          />
        </div>
      )}
    </li>
  );
}