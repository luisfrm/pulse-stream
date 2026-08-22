import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { SongItem } from "@/components/song-item";
import { albumsService } from "@/lib/services/albums-service";
import { getUserLibrary } from "@/lib/services/library";
import { CACHE_TAGS } from "@/lib/services/tags";

interface AlbumPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: AlbumPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const album = await albumsService.getAlbumById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.albums] },
    });
    return { title: `${album.title} — ${album.artist.name}` };
  } catch {
    return { title: "Álbum" };
  }
}

export const dynamic = "force-dynamic";

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { id } = await params;

  // Álbum y biblioteca del usuario en paralelo (la biblioteca no depende del
  // álbum; el session del layout ya está deduplicado con React.cache).
  const [album, library] = await Promise.all([
    albumsService
      .getAlbumById(id, {
        next: { revalidate: 60, tags: [CACHE_TAGS.albums] },
      })
      .catch(() => null),
    getUserLibrary(),
  ]);

  if (!album) notFound();

  const songs = album.songs ?? [];

  return (
    <div className="flex flex-col gap-8">
      <BackLink
        href={album.artist ? `/artist/${album.artist.id}` : "/songs"}
      />
      <section className="border-b border-bg-highlight bg-bg-elevated/60 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 sm:flex-row sm:items-end">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl border border-bg-highlight shadow-lg sm:h-52 sm:w-52">
            {album.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={album.cover_url}
                alt={`Cover de ${album.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
                <span className="font-display text-6xl font-extrabold text-bg-base">
                  {album.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-subdued">
              Álbum
            </p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight sm:text-5xl">
              {album.title}
            </h1>
            <Link
              href={`/artist/${album.artist.id}`}
              className="mt-2 block text-lg text-brand-400 hover:underline"
            >
              {album.artist.name}
            </Link>
            <p className="mt-1 text-sm text-text-subdued">
              {songs.length} {songs.length === 1 ? "canción" : "canciones"}
            </p>
          </div>
        </div>
      </section>

      {songs.length === 0 ? (
        <p className="text-text-subdued">
          Este álbum todavía no tiene canciones.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {songs.map((song) => (
            <SongItem
              key={song.id}
              song={song}
              queue={songs}
              favoriteIds={library?.favoriteIds}
              playlists={library?.playlists}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
