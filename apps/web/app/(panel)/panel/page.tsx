import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
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

  const withCovers = songs.items.filter((s) => s.cover_url).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-3xl font-bold">Panel</h1>
      <p className="mt-3 text-text-subdued">
        Gestioná el catálogo: artistas, canciones, covers y subidas a R2.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
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
            <div className="flex items-center justify-between rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3">
              <span className="text-sm text-text-subdued">Con cover</span>
              <span className="font-display text-lg font-bold">
                {withCovers}/{Math.min(songs.total, 5)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link
              href="/panel/songs/new"
              className="rounded-xl bg-brand-400 px-4 py-3 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
            >
              + Subir canción nueva
            </Link>
            <Link
              href="/panel/artists"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              Artistas — crear, buscar, covers
            </Link>
            <Link
              href="/panel/albums"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              Álbumes — agrupar canciones, covers
            </Link>
            <Link
              href="/panel/playlists"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              Playlists del sistema — generar curadas
            </Link>
            <Link
              href="/panel/songs"
              className="rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 text-sm transition-colors hover:border-brand-400"
            >
              Canciones — listar, reproducir, covers
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimas canciones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {songs.items.length === 0 ? (
              <p className="text-sm text-text-subdued">
                Todavía no hay canciones. Subí la primera.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {songs.items.map((song) => (
                  <li key={song.id}>
                    <Link
                      href={`/song/${song.id}`}
                      className="flex items-center gap-3 rounded-xl border border-bg-highlight bg-bg-elevated px-3 py-2 transition-colors hover:border-brand-400"
                    >
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-bg-highlight/40">
                        {song.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={song.cover_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {song.title}
                        </span>
                        <span className="block truncate text-xs text-text-subdued">
                          {song.artist.name}
                        </span>
                      </span>
                      {song.cover_url ? (
                        <Badge variant="success" size="sm">
                          cover
                        </Badge>
                      ) : (
                        <Badge variant="glass" size="sm">
                          sin cover
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
