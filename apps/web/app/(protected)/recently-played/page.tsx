import type { Metadata } from "next";

import { Pagination } from "@/components/pagination";
import { SongCard } from "@/components/song-card";
import { listensService } from "@/lib/services/listens-service";
import { Headphones } from "lucide-react";

import { RecentlyPlayedResults } from "./recently-played-results";

export const metadata: Metadata = { title: "Escuchadas recientemente" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 24;

export default async function RecentlyPlayedPage() {
  // Una sola llamada: items + total (paginación) + user_play_count por canción.
  const initialPage = await listensService.getRecentlyPlayed({
    offset: 0,
    limit: PAGE_LIMIT,
  });
  const totalUserPlays = initialPage.items.reduce(
    (sum, s) => sum + (s.user_play_count ?? 0),
    0,
  );

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

      <RecentlyPlayedResults initialPage={initialPage} />
    </div>
  );
}