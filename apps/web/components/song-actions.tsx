"use client";

import * as React from "react";
import { ListPlus, MoreHorizontal } from "lucide-react";

import { FavoriteButton } from "@/components/favorite-button";
import { NoCover } from "@/components/no-cover";
import { OfflineButton } from "@/components/offline-button";
import { PlaylistPicker } from "@/components/playlist-picker";
import { BottomSheet } from "@/components/ui";
import type { MyPlaylist, Song } from "@/lib/services/types";

interface SongActionsProps {
  song: Song;
  initialFavorited: boolean;
  playlists?: MyPlaylist[];
  onMutated?: () => Promise<void>;
}

/**
 * Acciones de canción por fila: corazón + "+" (playlist) + descarga offline.
 * En desktop (≥ 640 px) van los tres controles visibles; en mobile se colapsan
 * en un kebab que abre una hoja con las mismas acciones, para que el título de
 * la fila no pierda ancho.
 *
 * La superficie se elige por CSS (`sm:`) y no con `matchMedia`: el DOM es el
 * mismo en server y cliente (sin parpadeo de hidratación ni media queries en
 * jsdom).
 */
export function SongActions({
  song,
  initialFavorited,
  playlists = [],
  onMutated,
}: SongActionsProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  // Identidad estable: `BottomSheet` la usa en la dep de su efecto (body overflow).
  const closeSheet = React.useCallback(() => setSheetOpen(false), []);

  return (
    <>
      {/* Desktop: los tres controles de siempre, sin cambios. */}
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <FavoriteButton
          songId={song.id}
          initialFavorited={initialFavorited}
          onMutated={onMutated}
        />
        <PlaylistPicker song={song} playlists={playlists} onMutated={onMutated} />
        <OfflineButton song={song} compact />
      </div>

      {/* Mobile: un solo kebab de 44 px; el resto vive en la hoja. */}
      <div className="shrink-0 sm:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Más acciones de ${song.title}`}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="rounded-pill p-3 text-text-subdued transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
        >
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* La hoja va FUERA del wrapper `sm:hidden`: si se abre en mobile y el
          viewport cruza a desktop, tiene que seguir visible para poder cerrarla
          (si no, quedaría el scroll bloqueado por un modal invisible). */}
      <BottomSheet open={sheetOpen} onClose={closeSheet} title="Acciones">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-bg-highlight">
            {song.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={song.cover_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <NoCover size="sm" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{song.title}</span>
            <span className="block truncate text-xs text-text-subdued">
              {song.artist.name}
            </span>
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {/* Me gusta y Descargar dejan la hoja abierta: el usuario ve el
              estado cambiar en el mismo lugar. */}
          <FavoriteButton
            variant="menu"
            songId={song.id}
            initialFavorited={initialFavorited}
            onMutated={onMutated}
          />
          <button
            type="button"
            onClick={() => {
              // Dos pasos: se cierra esta hoja y el picker abre la suya (nunca
              // hojas anidadas).
              setSheetOpen(false);
              setPickerOpen(true);
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text-primary transition-colors hover:bg-bg-highlight focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400"
          >
            <ListPlus size={18} />
            <span className="flex-1">Agregar a playlist</span>
          </button>
          <OfflineButton variant="menu" song={song} />
        </div>
      </BottomSheet>

      <PlaylistPicker
        song={song}
        playlists={playlists}
        onMutated={onMutated}
        hideTrigger
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
    </>
  );
}
