import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, Play, Sparkles } from "lucide-react";

import { PlaylistCard } from "@/components/playlist-card";
import { SongCard } from "@/components/song-card";
import { artistsService } from "@/lib/services/artists-service";
import { playlistsService } from "@/lib/services/playlists-service";
import { getSession } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";

export const metadata: Metadata = { title: "Tu música, donde sea" };

export const dynamic = "force-dynamic";

const SECTION_LIMIT = 10;

export default async function HomePage() {
  // Con sesión, el home es el dashboard: el catálogo público vive en el board.
  // La sesión y el catálogo se resuelven en paralelo (el catálogo está cacheado
  // por tags; si hay sesión el redirect corta igual).
  const [user, catalog] = await Promise.all([
    getSession(),
    Promise.all([
      songsService.getSongs(
        { limit: SECTION_LIMIT },
        { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
      ),
      artistsService.getArtists(
        { limit: 6 },
        { next: { revalidate: 60, tags: [CACHE_TAGS.artists] } }
      ),
      // Playlists públicas de la comunidad (visible sin sesión).
      playlistsService
        .getPublicPlaylists(
          { limit: SECTION_LIMIT },
          { next: { revalidate: 60, tags: [CACHE_TAGS.playlists] } }
        )
        .then((page) => page.items)
        .catch(() => []),
    ]),
  ]);
  if (user) redirect("/dashboard");

  const [{ items: songs }, { items: artists }, publicPlaylists] = catalog;

  return (
    <main className="bg-blooms flex-1">
      {/* Hero — Marquee: la tipografía es el diseño */}
      <section className="flex min-h-[88dvh] flex-col items-center justify-center px-6 pt-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-pill border border-bg-highlight bg-bg-elevated/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-200">
          <Sparkles size={12} />
          Streaming de música
        </span>
        <h1 className="font-display mt-6 max-w-5xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl">
          Tu música.
          <br />
          Donde sea.
        </h1>
        <p className="mt-6 max-w-md text-base text-text-subdued sm:text-lg">
          Descubrí canciones y playlists de toda la comunidad. Creá tu
          biblioteca y llévala a todos lados.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-pill bg-brand-400 px-7 py-3.5 font-semibold text-bg-base transition-all hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            Crear cuenta gratis
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-pill border border-bg-highlight bg-bg-elevated/60 px-7 py-3.5 font-semibold text-text-primary transition-colors hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Iniciar sesión
          </Link>
        </div>

        <a
          href="#catalogo"
          className="mt-14 inline-flex flex-col items-center gap-1 text-xs text-text-subdued transition-colors hover:text-text-primary"
        >
          <ArrowDown size={16} />
          Escuchá sin cuenta
        </a>
      </section>

      {/* Regla gruesa entre el hero y el catálogo */}
      <div className="mx-auto max-w-6xl px-6">
        <hr className="h-px border-0 bg-gradient-to-r from-transparent via-bg-highlight to-transparent" />
      </div>

      {/* Catálogo */}
      <section id="catalogo" className="mx-auto flex max-w-6xl flex-col gap-14 px-6 py-16">
        {songs.length > 0 && (
          <div>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold sm:text-3xl">
                  Recién agregadas
                </h2>
                <p className="mt-1 text-sm text-text-subdued">
                  Lo último que se sumó al catálogo. Dale play sin crear cuenta.
                </p>
              </div>
              <Link
                href="/register"
                className="hidden shrink-0 text-sm font-medium text-brand-400 hover:underline sm:block"
              >
                Guardarlas → registrate
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {songs.map((song) => (
                <SongCard key={song.id} song={song} queue={songs} />
              ))}
            </div>
          </div>
        )}

        {artists.length > 0 && (
          <div>
            <h2 className="mb-5 font-display text-2xl font-bold sm:text-3xl">
              Artistas del catálogo
            </h2>
            <div className="flex flex-wrap gap-3">
              {artists.map((artist) => (
                <Link
                  key={artist.id}
                  href={`/artist/${artist.id}`}
                  className="card-lift inline-flex items-center gap-3 rounded-pill border border-bg-highlight bg-bg-elevated/60 py-2 pl-2 pr-5"
                >
                  {artist.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={artist.cover_url}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-full font-display font-extrabold text-bg-base">
                      {artist.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium">{artist.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {publicPlaylists.length > 0 && (
          <div>
            <div className="mb-5">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                Playlists de la comunidad
              </h2>
              <p className="mt-1 text-sm text-text-subdued">
                Listas públicas armadas por otros oyentes.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {publicPlaylists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  href="/register"
                />
              ))}
            </div>
          </div>
        )}

        {/* CTA final */}
        <div className="card-lift relative overflow-hidden rounded-3xl border border-bg-highlight bg-bg-elevated/70 px-6 py-12 text-center">
          <div className="bg-blooms pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative">
            <Play className="mx-auto mb-4 text-brand-400" size={28} />
            <h2 className="font-display mx-auto max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Tu biblioteca, tu historial, tu música.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-text-subdued">
              Guardá tus favoritos, armá playlists y seguí tu historial de
              reproducción. Gratis.
            </p>
            <Link
              href="/register"
              className="mt-7 inline-block rounded-pill bg-brand-400 px-8 py-3.5 font-semibold text-bg-base transition-colors hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Ft5 — Statement */}
      <footer className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-10 pt-4">
        <p className="font-display max-w-md text-3xl font-bold leading-tight sm:text-4xl">
          El soundtrack de tu día, siempre a mano.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-bg-highlight pt-5">
          <p className="font-display text-sm font-bold">Pulse Stream</p>
          <p className="text-xs text-text-subdued">
            Hecho con música · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </main>
  );
}