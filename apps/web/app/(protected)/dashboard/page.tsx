import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { SectionGridSkeleton } from "@/components/loading-skeletons";
import { PlaylistCard } from "@/components/playlist-card";
import { SongCard } from "@/components/song-card";
import { listensService } from "@/lib/services/listens-service";
import { playlistsService } from "@/lib/services/playlists-service";
import { getSession } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import { firstNameFromEmail, greetingForHour } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

const SECTION_LIMIT = 10;

export default async function DashboardHome() {
  // El layout protegido ya resolvió la sesión (React.cache la deduplica):
  // esta llamada no genera un segundo /users/me.
  const user = await getSession();
  if (!user) return null; // el layout redirige

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

      {/* Cada sección hace su propio fetch y streamea al resolver: la lenta no
          bloquea a las demás (el catálogo cacheado llega antes que los datos
          del usuario). */}
      <Suspense fallback={<SectionGridSkeleton title="Seguí escuchando" />}>
        <RecentSection />
      </Suspense>

      <Suspense fallback={<SectionGridSkeleton title="Recién agregadas" />}>
        <NewSongsSection />
      </Suspense>

      <Suspense fallback={<SectionGridSkeleton title="Más escuchadas esta semana" />}>
        <PopularWeekSection />
      </Suspense>

      <Suspense fallback={<SectionGridSkeleton title="Más escuchadas este mes" />}>
        <PopularMonthSection />
      </Suspense>

      <Suspense fallback={<SectionGridSkeleton title="Playlists de la comunidad" />}>
        <CommunityPlaylistsSection />
      </Suspense>
    </div>
  );
}

async function RecentSection() {
  const { items, total } = await listensService
    .getRecentlyPlayed({ limit: SECTION_LIMIT })
    .catch(() => ({ items: [], total: 0 }));

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="font-display text-xl font-bold">Seguí escuchando</h2>
        {total > SECTION_LIMIT && (
          <Link
            href="/recently-played"
            className="text-sm font-medium text-text-subdued transition-colors hover:text-brand-400"
          >
            Ver todo
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {items.map((song, idx) => (
          <SongCard key={song.id} song={song} queue={items} priority={idx < 4} />
        ))}
      </div>
    </section>
  );
}

async function NewSongsSection() {
  const newSongs = await songsService
    .getSongs(
      { limit: SECTION_LIMIT },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
    )
    .then((p) => p.items)
    .catch(() => []);

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="font-display text-xl font-bold">Recién agregadas</h2>
        <Link
          href="/search"
          className="text-sm font-medium text-text-subdued transition-colors hover:text-brand-400"
        >
          Explorar
        </Link>
      </div>
      {newSongs.length === 0 ? (
        <p className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-8 text-center text-sm text-text-subdued">
          Todavía no hay canciones publicadas. Vuelve más tarde.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {newSongs.map((song, idx) => (
            <SongCard key={song.id} song={song} queue={newSongs} priority={idx < 4} />
          ))}
        </div>
      )}
    </section>
  );
}

async function PopularWeekSection() {
  const popularWeek = await songsService
    .getPopular(
      { limit: SECTION_LIMIT, days: 7 },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
    )
    .catch(() => []);

  if (popularWeek.length === 0) return null;

  return (
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
        {popularWeek.map((song, idx) => (
          <SongCard key={song.id} song={song} queue={popularWeek} priority={idx < 4} />
        ))}
      </div>
    </section>
  );
}

async function PopularMonthSection() {
  const popularMonth = await songsService
    .getPopular(
      { limit: SECTION_LIMIT, month: true },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
    )
    .catch(() => []);

  if (popularMonth.length === 0) return null;

  return (
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
        {popularMonth.map((song, idx) => (
          <SongCard key={song.id} song={song} queue={popularMonth} priority={idx < 4} />
        ))}
      </div>
    </section>
  );
}

async function CommunityPlaylistsSection() {
  const publicPlaylists = await playlistsService
    .getPublicPlaylists(
      { limit: SECTION_LIMIT },
      { next: { revalidate: 300, tags: [CACHE_TAGS.playlists] } }
    )
    .then((p) => p.items)
    .catch(() => []);

  if (publicPlaylists.length === 0) return null;

  return (
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
        {publicPlaylists.map((playlist, idx) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            href={`/playlists/${playlist.id}`}
            priority={idx < 4}
          />
        ))}
      </div>
    </section>
  );
}