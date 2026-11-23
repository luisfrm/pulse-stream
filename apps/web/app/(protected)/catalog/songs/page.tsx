import type { Metadata } from "next";

import { refreshLibrary } from "@/app/(protected)/actions";
import { getUserLibrary } from "@/lib/services/library";

import { SongsList } from "./songs-list";

export const metadata: Metadata = { title: "Tus canciones" };
export const dynamic = "force-dynamic";

/**
 * Todas las canciones agregadas (favoritos) con infinite scroll.
 * El server resuelve sesión + biblioteca (para corazones/playlists) y el
 * client (`SongsList`) pagina con GET /me/favorites offset/limit de a 20.
 */
export default async function CatalogSongsPage() {
  const library = await getUserLibrary();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Tus canciones
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Todas las canciones que guardaste, de la más reciente a la más antigua.
        </p>
      </header>

      <SongsList library={library} onMutated={refreshLibrary} />
    </div>
  );
}