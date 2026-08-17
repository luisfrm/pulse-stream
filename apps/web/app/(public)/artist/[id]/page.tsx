import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SongItem } from "@/components/song-item";
import { Title } from "@/components/ui";
import { artistsService } from "@/lib/services/artists-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

interface ArtistPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ArtistPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const artist = await artistsService.getArtistById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.artists] },
    });
    return { title: artist.name };
  } catch {
    return { title: "Artista" };
  }
}

export const dynamic = "force-dynamic";

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { id } = await params;

  // Lecturas en paralelo: artista + sus canciones
  const artist = await artistsService
    .getArtistById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.artists] },
    })
    .catch(() => null);
  if (!artist) notFound();

  const { items: songs } = await songsService
    .getSongs(
      { artistId: id, limit: 50 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
    )
    .catch(() => ({ items: [] as never[] }));

  return (
    <main className="flex-1">
      <section className="bg-brand-gradient px-6 py-12 text-bg-base">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
            Artista
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl">
            {artist.name}
          </h1>
          <p className="mt-3 text-bg-base/80">
            {songs.length} {songs.length === 1 ? "canción" : "canciones"} en el
            catálogo
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <Title as="h2" size="section">
          Canciones
        </Title>

        {songs.length === 0 ? (
          <p className="mt-4 text-text-subdued">
            Todavía no hay canciones de este artista.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {songs.map((song) => (
              <SongItem key={song.id} song={song} queue={songs} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
