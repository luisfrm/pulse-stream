"use client";

import * as React from "react";

import { MediaCard } from "@/components/media-card";
import { albumContext, playlistContext } from "@/components/player/play-contexts";
import { songsService } from "@/lib/services/songs-service";
import { usePlayer } from "./player/player-provider";

type QueueParams = { playlistId: string } | { albumId: string };

interface ContextMediaCardProps {
  title: string;
  href: string;
  coverUrl?: string | null;
  /** "5 canciones" / "Bad Bunny · Álbum". */
  subtitle: React.ReactNode;
  /** Filtro serializable: el fetch de la cola se resuelve recién al clic. */
  queueParams: QueueParams;
}

/**
 * Card de playlist/álbum en carruseles: el play resuelve la primera página
 * recién al clic (sin N+1 ni colas en el payload del home) y deja un
 * `PlayContext` para que el reproductor siga trayendo páginas solo.
 */
export function ContextMediaCard({
  title,
  href,
  coverUrl,
  subtitle,
  queueParams,
}: ContextMediaCardProps) {
  const { play } = usePlayer();
  const [loading, setLoading] = React.useState(false);

  async function handlePlay() {
    if (loading) return;
    setLoading(true);
    try {
      if ("albumId" in queueParams) {
        // El álbum se resuelve completo de una vez y en orden de track: la
        // primera página ya alcanza para arrancar (el resto son slices del
        // array cacheado del propio contexto).
        const context = albumContext({
          albumId: queueParams.albumId,
          albumTitle: title,
        });
        const page = (await context.loadPage?.(0, 50)) ?? [];
        if (page.length > 0) play(page[0], { ...context, seed: page });
        return;
      }

      const page = await songsService.getSongs({
        playlistId: queueParams.playlistId,
        limit: 25,
      });
      if (page.items.length > 0) {
        play(
          page.items[0],
          playlistContext({
            playlistId: queueParams.playlistId,
            playlistName: title,
            seed: page.items,
            total: page.total,
          }),
        );
      }
    } catch {
      // Sin cola no hay play: el detalle de la colección muestra el error real.
    } finally {
      setLoading(false);
    }
  }

  return (
    <MediaCard
      title={title}
      href={href}
      coverUrl={coverUrl}
      subtitle={subtitle}
      onPlay={handlePlay}
      playDisabled={loading}
    />
  );
}
