"use client";

import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Button } from "@/components/ui";
import { usePlayer } from "./player-provider";

/** Barra fija inferior: aparece cuando hay una canción cargada. */
export function PlayerBar() {
  const { current, playing, toggle, next, prev, hasPrev, hasNext } = usePlayer();

  if (!current) return null;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-bg-highlight bg-bg-base/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/song/${current.id}`}
            className="block truncate font-medium hover:underline"
          >
            {current.title}
          </Link>
          <Link
            href={`/artist/${current.artist.id}`}
            className="block truncate text-xs text-text-subdued hover:underline"
          >
            {current.artist.name}
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Anterior"
            onClick={prev}
            disabled={!hasPrev}
          >
            <SkipBack size={16} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            aria-label={playing ? "Pausar" : "Reproducir"}
            onClick={toggle}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Siguiente"
            onClick={next}
            disabled={!hasNext}
          >
            <SkipForward size={16} />
          </Button>
        </div>
      </div>
    </footer>
  );
}
