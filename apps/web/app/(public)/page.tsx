import type { Metadata } from "next";
import Link from "next/link";

import { SongItem } from "@/components/song-item";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { Title } from "@/components/ui";
import { artistsService } from "@/lib/services/artists-service";
import { sessionService } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

export const metadata: Metadata = { title: "Inicio" };

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 8;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  // Sesión (para mostrar u ocultar el acceso al panel; el catálogo es público)
  const user = await sessionService.getSession();
  const isAdmin = Boolean(user && (user.role === "admin" || user.is_superuser));

  // Lecturas en paralelo, cacheadas con tags (catálogo público)
  const [{ items: songs, total }, { items: artists }] = await Promise.all([
    songsService.getSongs(
      { query: query || undefined, offset, limit: PAGE_LIMIT },
      { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
    ),
    artistsService.getArtists(
      { limit: 6 },
      { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } }
    ),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="bg-brand-gradient px-6 py-14 text-bg-base sm:py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6">
          <span className="rounded-pill bg-bg-base/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest">
            Streaming musical
          </span>
          <h1 className="font-display max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Tu música, en Pulse Stream.
          </h1>
          <p className="max-w-md text-lg text-bg-base/80">
            Descubrí el catálogo, buscá tus artistas y reproducí sin
            interrupciones.
          </p>
          <div className="flex flex-wrap gap-3">
            {user ? (
              <Link
                href={isAdmin ? "/panel" : "/dashboard"}
                className="rounded-pill bg-bg-base px-6 py-3 font-semibold text-brand-400 transition-colors hover:bg-bg-highlight"
              >
                {isAdmin ? "Ir al panel" : "Mi cuenta"}
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-pill bg-bg-base px-6 py-3 font-semibold text-brand-400 transition-colors hover:bg-bg-highlight"
                >
                  Crear cuenta gratis
                </Link>
                <Link
                  href="/login"
                  className="rounded-pill border border-bg-base/40 px-6 py-3 font-semibold text-bg-base transition-colors hover:border-bg-base"
                >
                  Iniciar sesión
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Búsqueda (estado en la URL: ?q=...) */}
        <div className="flex max-w-md items-center gap-3">
          <SearchInput initialValue={query} placeholder="Buscar canciones…" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* Catálogo de canciones */}
          <section className="lg:col-span-2">
            <Title as="h2" size="section">
              {query ? `Resultados para “${query}”` : "Canciones recientes"}
            </Title>

            {songs.length === 0 ? (
              <p className="mt-4 text-text-subdued">
                {query
                  ? "Sin resultados para tu búsqueda."
                  : "Todavía no hay canciones publicadas."}
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {songs.map((song) => (
                  <SongItem key={song.id} song={song} queue={songs} />
                ))}
              </ul>
            )}

            <div className="mt-6">
              <Pagination
                page={page}
                totalPages={totalPages}
                limit={PAGE_LIMIT}
              />
            </div>
          </section>

          {/* Artistas */}
          <aside>
            <Title as="h2" size="section">
              Artistas
            </Title>
            {artists.length === 0 ? (
              <p className="mt-4 text-sm text-text-subdued">Sin artistas aún.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {artists.map((artist) => (
                  <li key={artist.id}>
                    <Link
                      href={`/artist/${artist.id}`}
                      className="block rounded-xl border border-bg-highlight bg-bg-elevated px-4 py-3 transition-colors hover:border-brand-400"
                    >
                      <span className="font-medium">{artist.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
