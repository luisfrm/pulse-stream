import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LyricsView } from "@/components/lyrics-view";
import { PlayButton } from "@/components/player/play-button";
import { Badge } from "@/components/ui";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

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

  return (
    <main className="flex-1">
      <section className="border-b border-bg-highlight bg-bg-elevated/60 px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-4">
          <PlayButton song={song} size="lg" />
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              {song.title}
            </h1>
            <Link
              href={`/artist/${song.artist.id}`}
              className="mt-2 block text-lg text-brand-400 hover:underline"
            >
              {song.artist.name}
            </Link>
          </div>
          {(song.genres?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {song.genres!.map((genre) => (
                <Badge key={genre} variant="glass" size="sm">
                  {genre}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <LyricsView lyrics={song.lyrics ?? null} />
      </div>
    </main>
  );
}
