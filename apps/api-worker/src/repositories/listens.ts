/**
 * Acceso a datos de reproducciones (espejo de `features/listens/repository.py`).
 *
 * F6 solo necesita el ranking (`topSongIds`) para armar los snapshots de las
 * playlists del sistema; F7 (historial + contadores) extiende este archivo.
 */

import { asc, count, desc, gte } from "drizzle-orm";

import { createDb } from "@/db/client";
import { listens } from "@/db/schema";
import type { AppConfig } from "@/env";

/** Par (canción, plays) del ranking de reproducciones. */
export interface SongPlayRanking {
  songId: string;
  plays: number;
}

export interface TopSongOptions {
  /** Inicio de la ventana; `null` = sin filtro temporal. */
  since: Date | null;
  limit: number;
}

/**
 * Ranking de reproducciones: `count(*)` por canción, orden `plays desc,
 * song_id asc` (desempate determinista para que el snapshot sea estable).
 */
export async function topSongIds(
  config: AppConfig,
  options: TopSongOptions,
): Promise<SongPlayRanking[]> {
  const rows = await createDb(config)
    .select({ songId: listens.songId, plays: count(listens.id) })
    .from(listens)
    .where(options.since ? gte(listens.playedAt, options.since) : undefined)
    .groupBy(listens.songId)
    .orderBy(desc(count(listens.id)), asc(listens.songId))
    .limit(options.limit);

  return rows.map(({ songId, plays }) => ({ songId, plays }));
}
