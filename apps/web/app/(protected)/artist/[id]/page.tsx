import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { refreshLibrary } from "@/app/(protected)/actions";
import { BackLink } from "@/components/back-link";
import { albumsService } from "@/lib/services/albums-service";
import { artistsService } from "@/lib/services/artists-service";
import { getUserLibrary } from "@/lib/services/library";
import { playlistsService } from "@/lib/services/playlists-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import type {
  Album,
  Page,
  Playlist,
  Song,
} from "@/lib/services/types";

import { ArtistDetails } from "./artist-details";

interface ArtistPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ArtistPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const artist = await artistsService.getArtistById(id, {
      next: { revalidate: 300, tags: [CACHE_TAGS.artists] },
    });
    return { title: artist.name };
  } catch {
    return { title: "Artista" };
  }
}

export const dynamic = "force-dynamic";

/** Populares y discografía: 10 (carrusel/shelf); colaboraciones: 20 filas. */
const TOP_LIMIT = 10;
const ALBUM_LIMIT = 10;
const PLAYLIST_LIMIT = 10;
const COLLABORATION_LIMIT = 20;

const emptySongs = (limit: number): Page<Song> => ({
  items: [],
  total: 0,
  offset: 0,
  limit,
});
const emptyAlbums = (limit: number): Page<Album> => ({
  items: [],
  total: 0,
  offset: 0,
  limit,
});
const emptyPlaylists = (limit: number): Page<Playlist> => ({
  items: [],
  total: 0,
  offset: 0,
  limit,
});

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { id } = await params;

  const artist = await artistsService
    .getArtistById(id, {
      next: { revalidate: 300, tags: [CACHE_TAGS.artists] },
    })
    .catch(() => null);
  if (!artist) notFound();

  // Lecturas en paralelo: catálogo cacheado por tag + biblioteca privada
  // (no-store). Cada lista trae su primera página; el resto se appendea con
  // "Ver más" en el cliente.
  const [
    initialSongs,
    initialAlbums,
    initialPlaylists,
    initialCollaborations,
    library,
  ] = await Promise.all([
    songsService
      .getSongs(
        { artistId: id, offset: 0, limit: TOP_LIMIT, sort: "plays" },
        { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } },
      )
      .catch(() => emptySongs(TOP_LIMIT)),
    albumsService
      .getAlbums(
        { artistId: id, offset: 0, limit: ALBUM_LIMIT },
        { next: { revalidate: 300, tags: [CACHE_TAGS.albums] } },
      )
      .catch(() => emptyAlbums(ALBUM_LIMIT)),
    // "Incluye a {artista}": playlists públicas con canciones del artista. La
    // Essentials (si existe) ya entra por acá y viene primera (system primero),
    // así que NO se pide aparte (`/playlists/system/essentials`).
    playlistsService
      .getPublicPlaylists(
        { artistId: id, limit: PLAYLIST_LIMIT },
        { next: { revalidate: 300, tags: [CACHE_TAGS.playlists] } },
      )
      .catch(() => emptyPlaylists(PLAYLIST_LIMIT)),
    songsService
      .getSongs(
        { collaboratorId: id, offset: 0, limit: COLLABORATION_LIMIT },
        { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } },
      )
      .catch(() => emptySongs(COLLABORATION_LIMIT)),
    getUserLibrary(),
  ]);

  const totalSongs = initialSongs.total + initialCollaborations.total;

  return (
    <div className="flex flex-col gap-10">
      <BackLink href="/songs" />

      <section className="relative -mx-4 overflow-hidden px-6 py-12 text-bg-base lg:-mx-8">
        {artist.cover_url ? (
          <>
            {/* Cover del artista como fondo (decorativa: el nombre va como texto). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artist.cover_url}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Overlay con el MISMO gradiente de marca: el texto oscuro sigue
                legible sobre la foto y se conserva la identidad del hero. */}
            <div
              aria-hidden="true"
              className="bg-brand-gradient absolute inset-0 opacity-90"
            />
          </>
        ) : (
          <div aria-hidden="true" className="bg-brand-gradient absolute inset-0" />
        )}

        <div className="relative mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
            Artista
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl">
            {artist.name}
          </h1>
          <p className="mt-3 text-bg-base/80">
            {totalSongs} {totalSongs === 1 ? "canción" : "canciones"} en el
            catálogo
            {initialAlbums.total > 0 &&
              ` · ${initialAlbums.total} ${initialAlbums.total === 1 ? "álbum" : "álbumes"}`}
          </p>
        </div>
      </section>

      <div className="space-y-10">
        {/* `key`: al navegar artista → artista se remonta el cliente y ninguna
            sección conserva el estado (items/offset) del artista anterior. */}
        <ArtistDetails
          key={id}
          artistId={id}
          artistName={artist.name}
          initialSongs={initialSongs}
          initialAlbums={initialAlbums}
          initialPlaylists={initialPlaylists.items}
          initialCollaborations={initialCollaborations}
          library={library}
          onMutated={refreshLibrary}
        />
      </div>
    </div>
  );
}
