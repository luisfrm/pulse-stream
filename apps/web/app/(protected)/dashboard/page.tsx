import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, Plus } from "lucide-react";

import { Carousel } from "@/components/carousel";
import { Chips } from "@/components/chips";
import { ContextMediaCard } from "@/components/context-media-card";
import { CarouselSkeleton } from "@/components/loading-skeletons";
import { NoCover } from "@/components/no-cover";
import { Section } from "@/components/section";
import { SongCard } from "@/components/song-card";
import { Skeleton } from "@/components/ui";
import { favoritesService } from "@/lib/services/favorites-service";
import { listensService } from "@/lib/services/listens-service";
import { playlistsService } from "@/lib/services/playlists-service";
import { getSession } from "@/lib/services/session-service";
import { songsService } from "@/lib/services/songs-service";
import { CACHE_TAGS } from "@/lib/services/tags";
import type { MyPlaylist, Playlist, Song } from "@/lib/services/types";
import { firstNameFromEmail, greetingForHour } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

const SECTION_LIMIT = 10;

const CHIPS = [
  { value: "", label: "Todo" },
  { value: "canciones", label: "Canciones" },
  { value: "playlists", label: "Playlists" },
  { value: "albumes", label: "Álbumes" },
] as const;

const FILTERS = new Set<string>(["canciones", "playlists", "albumes"]);

/** Item de carrusel (≈2.2 cards en móvil, 5-6 en desktop). */
const CAROUSEL_ITEM = "w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[196px]";
const SHORTCUT_TILE =
  "flex h-16 items-center gap-3 overflow-hidden rounded-lg bg-bg-elevated/60 pr-4 transition-colors hover:bg-bg-highlight";

/** `/me/playlists` se pide una sola vez por request (shortcuts + sección 6). */
const getDashboardPlaylists = cache(async (): Promise<MyPlaylist[]> => {
  return await playlistsService.getMyPlaylists().catch(() => []);
});

/** Feed público (30) compartido por "Playlists de la comunidad" y "Destacados". */
const getCommunityPlaylists = cache(async (): Promise<Playlist[]> => {
  return await playlistsService
    .getPublicPlaylists(
      { limit: 30 },
      { next: { revalidate: 300, tags: [CACHE_TAGS.playlists] } }
    )
    .then((page) => page.items)
    .catch(() => []);
});

function songCountLabel(count: number): string {
  return `${count} ${count === 1 ? "canción" : "canciones"}`;
}

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string | string[] }>;
}) {
  // El layout protegido ya resolvió la sesión (React.cache la deduplica).
  const [params, user] = await Promise.all([searchParams, getSession()]);
  if (!user) return null; // el layout redirige

  const displayName = user.username?.trim() || firstNameFromEmail(user.email);

  // Param repetido o desconocido: se toma el primer valor VÁLIDO y se
  // redirige a la URL canónica para que el chip y las secciones coincidan.
  const tipoValues = Array.isArray(params.tipo)
    ? params.tipo
    : params.tipo
      ? [params.tipo]
      : [];
  const tipo = tipoValues.find((value) => FILTERS.has(value)) ?? "";
  const isCanonical =
    tipoValues.length === 0 ||
    (tipoValues.length === 1 && tipoValues[0] === tipo);
  if (!isCanonical) {
    redirect(tipo ? `/dashboard?tipo=${tipo}` : "/dashboard");
  }

  const showSongs = !tipo || tipo === "canciones";
  const showPlaylists = !tipo || tipo === "playlists";
  const showAlbums = !tipo || tipo === "albumes";

  return (
    <div className="flex flex-col">
      <header>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {greetingForHour(new Date().getHours())}, {displayName}
        </h1>
      </header>

      <div className="mt-6">
        <Chips chips={CHIPS} />
      </div>

      <Suspense fallback={<ShortcutsSkeleton />}>
        <Shortcuts />
      </Suspense>

      {showSongs && (
        <Suspense
          fallback={
            <CarouselSkeleton
              title="Lo más escuchado por ti"
              className="mt-6"
            />
          }
        >
          <TopSongsSection />
        </Suspense>
      )}

      {showSongs && (
        <Suspense
          fallback={<CarouselSkeleton title="Seguí escuchando" className="mt-6" />}
        >
          <RecentlyPlayedSection />
        </Suspense>
      )}

      {showPlaylists && (
        <Suspense
          fallback={<CarouselSkeleton title="Tus playlists" className="mt-6" />}
        >
          <MyPlaylistsSection />
        </Suspense>
      )}

      {showAlbums && (
        <Suspense
          fallback={
            <CarouselSkeleton title="Álbumes que te gustan" className="mt-6" />
          }
        >
          <FavoriteAlbumsSection />
        </Suspense>
      )}

      {showSongs && (
        <Suspense
          fallback={<CarouselSkeleton title="Top de la semana" className="mt-6" />}
        >
          <PopularWeekSection />
        </Suspense>
      )}

      {showPlaylists && (
        <Suspense
          fallback={
            <CarouselSkeleton title="Playlists de la comunidad" className="mt-6" />
          }
        >
          <CommunityPlaylistsSection />
        </Suspense>
      )}

      {showSongs && (
        <Suspense
          fallback={<CarouselSkeleton title="Top del mes" className="mt-6" />}
        >
          <PopularMonthSection />
        </Suspense>
      )}

      {showPlaylists && (
        <Suspense
          fallback={<CarouselSkeleton title="Destacados" className="mt-6" />}
        >
          <FeaturedSection />
        </Suspense>
      )}
    </div>
  );
}

/** Tiles horizontales: "Tus canciones" + hasta 5 playlists propias. */
async function Shortcuts() {
  const playlists = (await getDashboardPlaylists())
    .filter((playlist) => playlist.kind === "user")
    .slice(0, 5);

  return (
    <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/catalog/songs" className={SHORTCUT_TILE}>
        <div className="bg-brand-gradient flex h-16 w-16 shrink-0 items-center justify-center rounded-md">
          <Heart size={28} fill="currentColor" className="text-bg-base" />
        </div>
        <span className="truncate font-display text-base font-bold">Tus canciones</span>
      </Link>

      {playlists.map((playlist) => (
        <Link
          key={playlist.id}
          href={`/playlists/${playlist.id}`}
          className={SHORTCUT_TILE}
        >
          {playlist.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={playlist.cover_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-16 w-16 shrink-0 rounded-md object-cover"
            />
          ) : (
            <NoCover size="md" className="h-16 w-16 shrink-0" />
          )}
          <span className="truncate font-display text-base font-bold">
            {playlist.name}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Sección 4: top del usuario 7d o, en la MISMA ranura, recién subidas. */
async function TopSongsSection() {
  const topSongs = await listensService
    .getTopSongs({ days: 7, limit: SECTION_LIMIT })
    .catch(() => []);

  if (topSongs.length > 0) {
    return (
      <Section
        title="Lo más escuchado por ti"
        eyebrow="Tus últimos 7 días"
        href="/recently-played"
        className="mt-6"
      >
        <SongCarousel songs={topSongs} priority />
      </Section>
    );
  }

  const newSongs = await songsService
    .getSongs(
      { limit: SECTION_LIMIT },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
    )
    .then((page) => page.items)
    .catch(() => []);

  if (newSongs.length === 0) return null;

  return (
    <Section
      title="Recién subidas"
      eyebrow="Lo último que llegó al catálogo"
      href="/songs"
      className="mt-6"
    >
      <SongCarousel songs={newSongs} priority />
    </Section>
  );
}

/** Sección 5: historial del usuario (sin duplicar), último play primero. */
async function RecentlyPlayedSection() {
  const { items } = await listensService
    .getRecentlyPlayed({ limit: SECTION_LIMIT })
    .catch(() => ({ items: [], total: 0 }));

  if (items.length === 0) return null;

  return (
    <Section title="Seguí escuchando" href="/recently-played" className="mt-6">
      <SongCarousel songs={items} />
    </Section>
  );
}

/** Sección 6: playlists propias + card "Crear playlist". */
async function MyPlaylistsSection() {
  const playlists = (await getDashboardPlaylists()).filter(
    (playlist) => playlist.kind === "user"
  );

  if (playlists.length === 0) return null;

  return (
    <Section
      title="Tus playlists"
      href="/playlists"
      className="mt-6"
    >
      <Carousel>
        {playlists.map((playlist) => (
          <div key={playlist.id} className={CAROUSEL_ITEM}>
            <ContextMediaCard
              title={playlist.name}
              href={`/playlists/${playlist.id}`}
              coverUrl={playlist.cover_url}
              subtitle={songCountLabel(playlist.song_count)}
              queueParams={{ playlistId: playlist.id }}
            />
          </div>
        ))}

        <div className={CAROUSEL_ITEM}>
          <Link
            href="/playlists"
            className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-bg-highlight text-text-subdued transition-colors hover:border-brand-400 hover:text-brand-400"
          >
            <Plus size={32} />
            <span className="font-display text-base font-bold">Crear playlist</span>
          </Link>
        </div>
      </Carousel>
    </Section>
  );
}

/** Sección 7: álbumes likeados, play resuelve la cola al clic. */
async function FavoriteAlbumsSection() {
  const albums = await favoritesService
    .getFavoriteAlbums({ limit: SECTION_LIMIT })
    .then((page) => page.items)
    .catch(() => []);

  if (albums.length === 0) return null;

  return (
    <Section
      title="Álbumes que te gustan"
      href="/catalog"
      className="mt-6"
    >
      <Carousel>
        {albums.map((album) => (
          <div key={album.id} className={CAROUSEL_ITEM}>
            <ContextMediaCard
              title={album.title}
              href={`/album/${album.id}`}
              coverUrl={album.cover_url}
              subtitle={`${album.artist.name} · Álbum`}
              queueParams={{ albumId: album.id }}
            />
          </div>
        ))}
      </Carousel>
    </Section>
  );
}

/** Sección 8: ranking público de los últimos 7 días. */
async function PopularWeekSection() {
  const songs = await songsService
    .getPopular(
      { limit: SECTION_LIMIT, days: 7 },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
    )
    .catch(() => []);

  if (songs.length === 0) return null;

  return (
    <Section
      title="Top de la semana"
      eyebrow="Los más reproducidos en los últimos 7 días"
      className="mt-6"
    >
      <SongCarousel songs={songs} />
    </Section>
  );
}

/** Sección 9: feed público (solo playlists de oyentes). */
async function CommunityPlaylistsSection() {
  const playlists = (await getCommunityPlaylists())
    .filter((playlist) => playlist.kind === "user")
    .slice(0, SECTION_LIMIT);

  if (playlists.length === 0) return null;

  return (
    <Section
      title="Playlists de la comunidad"
      eyebrow="Listas públicas de otros oyentes"
      className="mt-6"
    >
      <Carousel>
        {playlists.map((playlist) => (
          <div key={playlist.id} className={CAROUSEL_ITEM}>
            <ContextMediaCard
              title={playlist.name}
              href={`/playlists/${playlist.id}`}
              coverUrl={playlist.cover_url}
              subtitle={songCountLabel(playlist.song_count)}
              queueParams={{ playlistId: playlist.id }}
            />
          </div>
        ))}
      </Carousel>
    </Section>
  );
}

/** Sección 10: ranking del mes calendario (UTC). */
async function PopularMonthSection() {
  const songs = await songsService
    .getPopular(
      { limit: SECTION_LIMIT, month: true },
      { next: { revalidate: 300, tags: [CACHE_TAGS.songs] } }
    )
    .catch(() => []);

  if (songs.length === 0) return null;

  return (
    <Section
      title="Top del mes"
      eyebrow="El ranking del mes calendario"
      className="mt-6"
    >
      <SongCarousel songs={songs} />
    </Section>
  );
}

/** Sección 11: carrusel de playlists del sistema (si hay). */
async function FeaturedSection() {
  const systemPlaylists = (await getCommunityPlaylists()).filter(
    (playlist) => playlist.kind === "system"
  );

  if (systemPlaylists.length === 0) return null;

  return (
    <Section
      title="Destacados"
      eyebrow="Curadas por Pulse Stream"
      className="mt-6"
    >
      <Carousel>
        {systemPlaylists.map((playlist) => (
          <div key={playlist.id} className={CAROUSEL_ITEM}>
            <ContextMediaCard
              title={playlist.name}
              href={`/playlists/${playlist.id}`}
              coverUrl={playlist.cover_url}
              subtitle={songCountLabel(playlist.song_count)}
              queueParams={{ playlistId: playlist.id }}
            />
          </div>
        ))}
      </Carousel>
    </Section>
  );
}

/** Carrusel de canciones con el item de ancho Spotify. */
async function SongCarousel({
  songs,
  priority = false,
}: {
  songs: Song[];
  priority?: boolean;
}) {
  // Ya se trae para los shortcuts: no es un fetch extra (React.cache).
  const playlists = await getDashboardPlaylists();

  return (
    <Carousel>
      {songs.map((song, index) => (
        <div key={song.id} className={CAROUSEL_ITEM}>
          <SongCard
            song={song}
            queue={songs}
            playlists={playlists}
            priority={priority && index < 4}
          />
        </div>
      ))}
    </Carousel>
  );
}

function ShortcutsSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-16 rounded-lg" />
      ))}
    </div>
  );
}
