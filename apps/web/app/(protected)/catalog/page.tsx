import type { Metadata } from "next";
import { updateTag } from "next/cache";
import Link from "next/link";

import { AlbumCard } from "@/components/album-card";
import { PlaylistCard } from "@/components/playlist-card";
import { SearchInput } from "@/components/search-input";
import { SongItem } from "@/components/song-item";
import { Title } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import { getUserLibrary } from "@/lib/services/library";
import { CACHE_TAGS } from "@/lib/services/tags";

import { CreatePlaylistForm } from "@/app/(protected)/playlists/create-playlist-form";

export const metadata: Metadata = { title: "Mi catálogo" };
export const dynamic = "force-dynamic";

/** Canciones agregadas más recientes (sin paginación: "Ver todas" → /catalog/songs). */
const RECENT_LIMIT = 10;
/** Ventana de álbumes/playlists likeadas (sin paginación en esta página). */
const LIBRARY_LIMIT = 50;
/** Al buscar traemos una ventana grande y filtramos dentro (sin `q` en la API). */
const SEARCH_LIMIT = 200;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const songsFetch = query
    ? favoritesService.getFavorites({ limit: SEARCH_LIMIT })
    : favoritesService.getFavorites({ limit: RECENT_LIMIT });

  // Sesión + los 3 sets de likes + las 3 listas, en paralelo.
  const [library, favSongs, favPlaylists, favAlbums] = await Promise.all([
    getUserLibrary(),
    songsFetch,
    favoritesService.getFavoritePlaylists({ limit: LIBRARY_LIMIT }),
    favoritesService.getFavoriteAlbums({ limit: LIBRARY_LIMIT }),
  ]);

  // Server Action: purga tags tras una mutación (patrón de la página favorites).
  const refreshLibrary = async () => {
    "use server";
    updateTag(CACHE_TAGS.favorites);
    updateTag(CACHE_TAGS.playlists);
  };

  // Filtro DENTRO de la biblioteca (query param `q` en la URL).
  const q = query.toLowerCase();
  const matches = (value: string) => value.toLowerCase().includes(q);

  const songs = q
    ? favSongs.items.filter((s) => matches(s.title) || matches(s.artist.name))
    : favSongs.items;
  const songsTotal = q ? songs.length : favSongs.total;

  // Playlists propias + del sistema likeadas (sin duplicar ids).
  const seen = new Set<string>();
  const allPlaylists = [
    ...(library?.playlists ?? []),
    ...favPlaylists.items.filter((pl) => pl.kind === "system"),
  ].filter((pl) => {
    if (seen.has(pl.id)) return false;
    seen.add(pl.id);
    return true;
  });
  const playlists = q ? allPlaylists.filter((pl) => matches(pl.name)) : allPlaylists;

  const albums = q
    ? favAlbums.items.filter((a) => matches(a.title) || matches(a.artist.name))
    : favAlbums.items;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <Title as="h1" size="section">
          Mi catálogo
        </Title>
        <p className="mt-2 text-sm text-text-subdued">
          Tus canciones, playlists y álbumes guardados, en un solo lugar.
        </p>
      </header>

      {/* El input vive en la URL: al escribir se re-ejecuta el RSC con ?q=… */}
      <SearchInput initialValue={query} placeholder="Buscar en tu catálogo…" />

      {/* ── Canciones (lista, no cards) ─────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-display text-xl font-bold">Canciones</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-text-subdued">
              {songsTotal} {songsTotal === 1 ? "canción" : "canciones"}
            </span>
            {!query && (
              <Link
                href="/catalog/songs"
                className="text-sm font-medium text-text-subdued transition-colors hover:text-brand-400"
              >
                Ver todas
              </Link>
            )}
          </div>
        </div>

        {songs.length === 0 ? (
          <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
            {query
              ? "Sin canciones que coincidan con tu búsqueda."
              : "Todavía no guardaste canciones con corazón. Tocá el ♥ en cualquier canción del catálogo."}
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
                onMutated={refreshLibrary}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ── Playlists (propias + system likeadas + nueva) ───────────── */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-display text-xl font-bold">Playlists</h2>
          <Link
            href="/playlists"
            className="text-sm font-medium text-text-subdued transition-colors hover:text-brand-400"
          >
            Ver todas
          </Link>
        </div>

        {playlists.length === 0 && !query && (
          <p className="mb-4 rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-6 text-center text-sm text-text-subdued">
            Armá tu primera playlist, o guardá una del sistema con el corazón.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              href={`/playlists/${pl.id}`}
              compact
            />
          ))}
          <CreatePlaylistForm onCreated={refreshLibrary} />
        </div>
      </section>

      {/* ── Álbumes likeados ────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 font-display text-xl font-bold">Álbumes</h2>

        {albums.length === 0 ? (
          <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
            {query
              ? "Sin álbumes que coincidan con tu búsqueda."
              : "Todavía no guardaste álbumes. El ♥ de un álbum lo suma acá."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}