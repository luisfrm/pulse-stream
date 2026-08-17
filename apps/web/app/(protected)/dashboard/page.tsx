import type { Metadata } from "next";

import { PlaylistCard } from "@/components/playlist-card";
import { SongCard } from "@/components/song-card";
import { listensService } from "@/lib/services/listens-service";
import { playlistsService } from "@/lib/services/playlists-service";
import { sessionService } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { firstNameFromEmail, greetingForHour } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

const SECTION_LIMIT = 10;

export default async function DashboardHome() {
  const user = await sessionService.getSession();
  if (!user) return null; // el layout redirige

  // Datos del board en paralelo. Catálogo con tags; lo del usuario sin cachear.
  // `getRecentlyPlayed` devuelve { items, total } en UNA llamada — nada de
  // fetches duplicados.
  const [
    recentPage,
    newSongs,
    popularWeek,
    popularMonth,
    publicPlaylists,
  ] = await Promise.all([
    listensService
      .getRecentlyPlayed({ limit: SECTION_LIMIT })
      .catch(() => ({ items: [], total: 0 })),
    songsService
      .getSongs(
        { limit: SECTION_LIMIT },
        { next: { revalidate: 60, tags: [CACHE_TAGS.songs] } }
      )
      .then((p) => p.items)
      .catch(() => []),
    songsService
      .getPopular(
        { limit: SECTION_LIMIT, days: 7 },
        { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
      )
      .catch(() => []),
    songsService
      .getPopular(
        { limit: SECTION_LIMIT, month: true },
        { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
      )
      .catch(() => []),
    playlistsService
      .getPublicPlaylists(
        { limit: SECTION_LIMIT },
        { next: { revalidate: 60, tags: [CACHE_TAGS.playlists] } }
      )
      .then((p) => p.items)
      .catch(() => []),
  ]);

  const recentSongs = recentPage.items;
  const recentTotal = recentPage.total;
  const displayName = user.username?.trim() || firstNameFromEmail(user.email);

  return (
    <div className="flex flex-col gap-10">
      <header className="animate-rise">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {greetingForHour(new Date().getHours())}, {displayName}
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Todo lo que suena en Pulse Stream, para vos.
        </p>
      </header>

      {recentSongs.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-display text-xl font-bold">Seguí escuchando</h2>
            {recentTotal > SECTION_LIMIT && (
              <a
                href="/dashboard/recently-played"
                className="text-sm font-medium text-text-subdued transition-colors hover:text-brand-400"
              >
                Ver todo
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {recentSongs.map((song) => (
              <SongCard key={song.id} song={song} queue={recentSongs} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-display text-xl font-bold">Recién agregadas</h2>
          <a
            href="/dashboard/search"
            className="text-sm font-medium text-text-subdued transition-colors hover:text-brand-400"
          >
            Explorar
          </a>
        </div>
        {newSongs.length === 0 ? (
          <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
            Todavía no hay canciones publicadas. Vuelve más tarde.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {newSongs.map((song) => (
              <SongCard key={song.id} song={song} queue={newSongs} />
            ))}
          </div>
        )}
      </section>

      {popularWeek.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">
              Más escuchadas esta semana
            </h2>
            <p className="mt-0.5 text-sm text-text-subdued">
              Lo más reproducido en los últimos 7 días.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {popularWeek.map((song) => (
              <SongCard key={song.id} song={song} queue={popularWeek} />
            ))}
          </div>
        </section>
      )}

      {popularMonth.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">
              Más escuchadas este mes
            </h2>
            <p className="mt-0.5 text-sm text-text-subdued">
              El ranking del mes calendario, en vivo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {popularMonth.map((song) => (
              <SongCard key={song.id} song={song} queue={popularMonth} />
            ))}
          </div>
        </section>
      )}

      {publicPlaylists.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="font-display text-xl font-bold">
              Playlists de la comunidad
            </h2>
            <p className="mt-0.5 text-sm text-text-subdued">
              Listas públicas hechas por otros oyentes y el sistema.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {publicPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                href={`/dashboard/playlists/${playlist.id}`}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
