"use client";

import * as React from "react";

import { MediaCard } from "@/components/media-card";
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
 * Card de playlist/álbum en carruseles: el play resuelve la cola recién al
 * clic (sin N+1 ni colas en el payload del home).
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
      const items = (
        await songsService.getSongs({ ...queueParams, limit: 25 })
      ).items;
      if (items.length > 0) play(items[0], items);
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
