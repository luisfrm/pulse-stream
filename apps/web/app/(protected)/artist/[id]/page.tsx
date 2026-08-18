import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SongItem } from "@/components/song-item";
import { Title } from "@/components/ui";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { getUserLibrary } from "@/lib/services/library";
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

  // Lecturas en paralelo: artista + canciones + colaboraciones + álbumes
  const artist = await artistsService
    .getArtistById(id, {
      next: { revalidate: 60, tags: [CACHE_TAGS.artists] },
    })
    .catch(() => null);
  if (!artist) notFound();

  const [{ items: songs }, { items: collaborations }, albums] = await Promise.all([
    songsService
      .getSongs(
        { artistId: id, limit: 50 },
        { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
      )
      .catch(() => ({ items: [] as never[] })),
    songsService
      .getSongs(
        { collaboratorId: id, limit: 50 },
        { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
      )
      .catch(() => ({ items: [] as never[] })),
    albumsService
      .getAlbums(
        { artistId: id, limit: 50 },
        { next: { revalidate: 60, tags: [CACHE_TAGS.albums] } }
      )
      .then((p) => p.items)
      .catch(() => []),
  ]);

  // Biblioteca del usuario para las acciones por canción
  const library = await getUserLibrary();

  const totalSongs = songs.length + collaborations.length;

  return (
    <div className="flex flex-col gap-10">
      <section className="bg-brand-gradient -mx-4 px-6 py-12 text-bg-base lg:-mx-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
            Artista
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl">
            {artist.name}
          </h1>
          <p className="mt-3 text-bg-base/80">
            {totalSongs} {totalSongs === 1 ? "canción" : "canciones"} en el
            catálogo
            {albums.length > 0 &&
              ` · ${albums.length} ${albums.length === 1 ? "álbum" : "álbumes"}`}
          </p>
        </div>
      </section>

      <div className="space-y-10">
        <section>
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
        </section>

        {collaborations.length > 0 && (
          <section>
            <Title as="h2" size="section">
              Colaboraciones
            </Title>
            <p className="mt-1 text-sm text-text-subdued">
              Canciones donde {artist.name} participa como invitado.
            </p>
            <ul className="mt-4 space-y-2.5">
              {collaborations.map((song) => (
                <SongItem
                  key={song.id}
                  song={song}
                  queue={collaborations}
                  favoriteIds={library?.favoriteIds}
                  playlists={library?.playlists}
                />
              ))}
            </ul>
          </section>
        )}

        {albums.length > 0 && (
          <section>
            <Title as="h2" size="section">
              Álbumes
            </Title>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {albums.map((album) => (
                <Link
                  key={album.id}
                  href={`/album/${album.id}`}
                  className="card-lift group flex flex-col gap-3 rounded-2xl border border-bg-highlight bg-bg-elevated p-3 transition-colors hover:border-brand-400"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-bg-highlight bg-bg-highlight/40">
                    {album.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={album.cover_url}
                        alt={`Cover de ${album.title}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="bg-brand-gradient flex h-full w-full items-center justify-center">
                        <span className="font-display text-4xl font-extrabold text-bg-base">
                          {album.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold hover:underline">
                      {album.title}
                    </p>
                    <p className="truncate text-xs text-text-subdued">
                      {album.song_count}{" "}
                      {album.song_count === 1 ? "canción" : "canciones"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
