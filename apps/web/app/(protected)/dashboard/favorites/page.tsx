import type { Metadata } from "next";
import { updateTag } from "next/cache";

import { Pagination } from "@/components/pagination";
import { SongItem } from "@/components/song-item";
import { Title } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import { getUserLibrary } from "@/lib/services/library";
import { CACHE_TAGS } from "@/lib/services/tags";

export const metadata: Metadata = { title: "Tus favoritos" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  // Biblioteca (favoritos + playlists) para las acciones
  const library = await getUserLibrary();

  const { items: songs, total } = await favoritesService.getFavorites({
    offset,
    limit: PAGE_LIMIT,
  });

  // Server Action: purga tags de usuario tras una mutación
  const refreshLibrary = async () => {
    "use server";
    updateTag(CACHE_TAGS.favorites);
    updateTag(CACHE_TAGS.playlists);
  };

  const playlists = library?.playlists ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Title as="h1" size="section">
        Tus favoritos
      </Title>
      <p className="mt-2 text-sm text-text-subdued">
        {total} {total === 1 ? "canción guardada" : "canciones guardadas"} con
        corazón.
      </p>

      {songs.length === 0 ? (
        <p className="mt-8 text-text-subdued">
          Todavía no guardaste ninguna canción. Tocá el ♥ en cualquier canción
          del catálogo.
        </p>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {songs.map((song) => (
            <SongItem
              key={song.id}
              song={song}
              queue={songs}
              favoriteIds={library?.favoriteIds}
              playlists={playlists}
              onMutated={refreshLibrary}
            />
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_LIMIT))}
          limit={PAGE_LIMIT}
        />
      </div>
    </div>
  );
}
