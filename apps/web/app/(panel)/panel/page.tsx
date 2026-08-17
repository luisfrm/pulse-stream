import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { artistsService } from "@/lib/services/artists-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

export const dynamic = "force-dynamic";

/** Home del panel: lecturas del catálogo + accesos a las tablas de gestión. */
export default async function PanelHome() {
  // Lecturas en paralelo (tablas para las vistas del panel)
  const [artists, songs] = await Promise.all([
    artistsService.getArtists(
      { limit: 5 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } }
    ),
    songsService.getSongs(
      { limit: 5 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
    ),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Panel</h1>
      <p className="mt-3 text-text-subdued">
        Gestioná el catálogo: artistas, canciones y subidas a R2.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
              <span className="text-sm text-text-subdued">Artistas</span>
              <span className="font-display text-lg font-bold">{artists.total}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
              <span className="text-sm text-text-subdued">Canciones</span>
              <span className="font-display text-lg font-bold">{songs.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gestión</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link
              href="/panel/artists"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              Artistas — crear, buscar y borrar
            </Link>
            <Link
              href="/panel/songs"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              Canciones — listar, reproducir y borrar
            </Link>
            <Link
              href="/panel/songs/new"
              className="rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
            >
              + Subir canción nueva (con subida directa a R2)
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
