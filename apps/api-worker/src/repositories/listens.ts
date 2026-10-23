/**
 * Acceso a datos de reproducciones (espejo de `features/listens/repository.py`).
 *
 * Dos responsabilidades:
 *   - el historial del usuario (`/me/listens`, `/me/recently-played`), con los
 *     contadores de `songs.play_count` y `users.total_plays` en la MISMA
 *     transacción del INSERT;
 *   - el ranking global (`topSongIds`) que usan `/songs/popular` y los
 *     snapshots de las playlists del sistema.
 *
 * Sin transacciones interactivas (driver HTTP de Neon): lo que tiene que ser
 * atómico va en un `db.batch`.
 */

import { and, asc, count, countDistinct, desc, eq, gte, inArray, max, sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import { listens, songs, users, type ListenRow } from "@/db/schema";
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

/** El play más reciente del usuario (ventana de dedupe). */
export async function findLastListen(
  config: AppConfig,
  userId: string,
): Promise<ListenRow | null> {
  const rows = await createDb(config)
    .select()
    .from(listens)
    .where(eq(listens.userId, userId))
    .orderBy(desc(listens.playedAt))
    .limit(1);
  return rows[0] ?? null;
}

export interface NewListenValues {
  id: string;
  userId: string;
  songId: string;
}

/**
 * INSERT del play + los dos contadores en UNA transacción.
 *
 * `db.batch` viaja como una sola transacción al servidor de Neon: si falla un
 * UPDATE, el play tampoco queda (nunca un historial con contadores sin sumar o
 * al revés). Los incrementos son `col = col + 1` (atómico, race-safe) y
 * `played_at` lo pone Postgres (`now()` de la transacción).
 */
export async function insertListenWithCounters(
  config: AppConfig,
  values: NewListenValues,
): Promise<ListenRow> {
  const db = createDb(config);

  const [inserted] = await db.batch([
    db.insert(listens).values(values).returning(),
    db
      .update(songs)
      .set({ playCount: sql`${songs.playCount} + 1` })
      .where(eq(songs.id, values.songId)),
    db
      .update(users)
      .set({ totalPlays: sql`${users.totalPlays} + 1` })
      .where(eq(users.id, values.userId)),
  ] as const);

  const row = inserted[0];
  if (!row) throw new Error("INSERT de listen no devolvió fila");
  return row;
}

/**
 * IDs de canciones del historial (sin duplicar), por su ÚLTIMO play desc.
 *
 * `GROUP BY song_id` + `max(played_at)` pone cada canción en la posición de su
 * reproducción más reciente; el desempate por `song_id` hace la paginación
 * estable (una misma canción no puede repetirse).
 */
export async function listRecentlyPlayedSongIds(
  config: AppConfig,
  userId: string,
  offset: number,
  limit: number,
): Promise<string[]> {
  const rows = await createDb(config)
    .select({ songId: listens.songId, lastPlayed: max(listens.playedAt) })
    .from(listens)
    .where(eq(listens.userId, userId))
    .groupBy(listens.songId)
    .orderBy(desc(max(listens.playedAt)), asc(listens.songId))
    .offset(offset)
    .limit(limit);

  return rows.map((row) => row.songId);
}

/** `total` del historial: canciones distintas que reprodujo el usuario. */
export async function countDistinctPlayedSongs(
  config: AppConfig,
  userId: string,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: countDistinct(listens.songId) })
    .from(listens)
    .where(eq(listens.userId, userId));
  return rows[0]?.value ?? 0;
}

/**
 * Plays por canción del usuario para un conjunto de ids (UNA query agrupada,
 * sin N+1). Devuelve un Map vacío para las canciones sin plays.
 */
export async function countPlaysBySongForUser(
  config: AppConfig,
  userId: string,
  songIds: readonly string[],
): Promise<Map<string, number>> {
  const bySong = new Map<string, number>();
  if (songIds.length === 0) return bySong;

  const rows = await createDb(config)
    .select({ songId: listens.songId, plays: count(listens.id) })
    .from(listens)
    .where(
      and(
        eq(listens.userId, userId),
        inArray(listens.songId, [...songIds]),
      ),
    )
    .groupBy(listens.songId);

  for (const row of rows) bySong.set(row.songId, row.plays);
  return bySong;
}
