import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Headphones } from "lucide-react";

import { LyricsView } from "@/components/lyrics-view";
import { PlayButton } from "@/components/player/play-button";
import { Badge } from "@/components/ui";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { formatGenre } from "@/lib/utils/format";

interface SongPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: SongPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const song = await songsService.getSongById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.songs] },
    });
    return { title: `${song.title} — ${song.artist.name}` };
  } catch {
    return { title: "Canción" };
  }
}

export const dynamic = "force-dynamic";

export default async function SongPage({ params }: SongPageProps) {
  const { id } = await params;
  const song = await songsService
    .getSongById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.songs] },
    })
    .catch(() => null);

  if (!song) notFound();

  const collaborators = song.collaborators ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section className="border-b border-bg-highlight bg-bg-elevated/60 px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-4">
          <PlayButton
            song={song}
            size="lg"
            className="h-14 w-14 shrink-0 rounded-full p-0"
          />
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              {song.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-lg">
              <Link
                href={`/artist/${song.artist.id}`}
                className="text-brand-400 hover:underline"
              >
                {song.artist.name}
              </Link>
              {collaborators.length > 0 && (
                <span className="text-text-subdued">
                  · feat.{" "}
                  {collaborators.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ", "}
                      <Link
                        href={`/artist/${c.id}`}
                        className="text-brand-400 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </span>
                  ))}
                </span>
              )}
            </div>
            {song.album && (
              <Link
                href={`/album/${song.album.id}`}
                className="mt-1 block text-sm text-text-subdued hover:text-brand-400"
              >
                del álbum {song.album.title}
              </Link>
            )}
          </div>
          {(song.genres?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {song.genres!.map((genre) => (
                <Badge key={genre} variant="glass" size="sm">
                  {formatGenre(genre)}
                </Badge>
              ))}
            </div>
          )}
          {song.play_count > 0 && (
            <p className="inline-flex items-center gap-1.5 text-xs text-text-subdued">
              <Headphones size={13} aria-hidden />
              {song.play_count.toLocaleString("es")}{" "}
              {song.play_count === 1 ? "reproducción" : "reproducciones"}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl">
        <LyricsView lyrics={song.lyrics ?? null} />
      </div>
    </div>
  );
}
