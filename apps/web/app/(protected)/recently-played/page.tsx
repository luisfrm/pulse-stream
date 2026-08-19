import type { Metadata } from "next";
import Link from "next/link";
import { Headphones } from "lucide-react";

import { Pagination } from "@/components/pagination";
import { SongCard } from "@/components/song-card";
import { listensService } from "@/lib/services/listens-service";

export const metadata: Metadata = { title: "Escuchadas recientemente" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 24;

export default async function RecentlyPlayedPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const params = await searchParams;
  const offset = Math.max(0, Number(params.offset) || 0);
  const page = Math.floor(offset / PAGE_LIMIT) + 1;

  // Una sola llamada: items + total (paginación) + user_play_count por canción.
  const { items: songs, total } = await listensService.getRecentlyPlayed({
    offset,
    limit: PAGE_LIMIT,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const totalUserPlays = songs.reduce((sum, s) => sum + (s.user_play_count ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Escuchadas recientemente
        </h1>
        <p className="mt-1.5 text-sm text-text-subdued">
          Tu historial, sin repetir canciones. Cada play se registra cuando
          reproducís un tema y suma +1 a tus reproducciones.
        </p>
        {totalUserPlays > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-pill border border-bg-highlight bg-bg-elevated px-4 py-2 text-xs text-text-subdued">
            <Headphones size={14} aria-hidden />
            {totalUserPlays} {totalUserPlays === 1 ? "play" : "plays"} en esta
            página
          </p>
        )}
      </header>

      {songs.length === 0 ? (
        <div className="rounded-2xl border border-bg-highlight bg-bg-elevated/50 px-5 py-12 text-center">
          <p className="font-display text-lg">Todavía no escuchaste nada.</p>
          <p className="mt-1 text-sm text-text-subdued">
            Reproducí alguna canción y va a aparecer acá.
          </p>
          <Link
            href="/search"
            className="mt-5 inline-block rounded-pill bg-brand-400 px-6 py-2.5 text-sm font-semibold text-bg-base transition-colors hover:bg-brand-200"
          >
            Buscar canciones
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {songs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                queue={songs}
                badge={
                  (song.user_play_count ?? 0) > 1
                    ? `${song.user_play_count}×`
                    : undefined
                }
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} limit={PAGE_LIMIT} />
        </>
      )}
    </div>
  );
}