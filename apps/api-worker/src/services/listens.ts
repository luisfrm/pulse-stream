/**
 * Reglas de negocio del historial de reproducciones (espejo de
 * `features/listens/service.py`).
 *
 * Dedupe de 30 s: solo se descarta el MISMO play consecutivo (double-fire de
 * play/pause o reintentar sin cambiar de canción). Si el último listen del
 * usuario es otra canción —o pasaron 30 s— el play se registra de nuevo.
 *
 * Contadores: cada play REAL suma +1 a `songs.play_count` y a
 * `users.total_plays` en la misma transacción del INSERT (ver repository).
 */

import type { UserRow } from "@/db/schema";
import type { ListenRow } from "@/db/schema";
import type { AppConfig } from "@/env";
import { SongNotFoundError } from "@/lib/errors";
import {
  countDistinctPlayedSongs,
  countPlaysBySongForUser,
  findLastListen,
  insertListenWithCounters,
  listRecentlyPlayedSongIds,
} from "@/repositories/listens";
import { findSongsByIds, songExists, type SongWithRelations } from "@/repositories/songs";

/** Ventana de dedupe de plays consecutivos (Python: `timedelta(seconds=30)`). */
export const DEDUPE_WINDOW_MS = 30_000;

/** Ítem del historial: canción completa + plays del usuario en esa canción. */
export interface RecentlyPlayedItem {
  song: SongWithRelations;
  userPlayCount: number;
}

export interface RecentlyPlayedPage {
  items: RecentlyPlayedItem[];
  total: number;
}

/**
 * `POST /me/listens`: registra un play (201 en ambos caminos).
 *
 * Si es el mismo play consecutivo dentro de la ventana, devuelve un
 * `ListenRead` sintético con el `played_at` del último listen y un `id` nuevo
 * (misma semántica que Python), SIN insertar fila ni tocar contadores.
 */
export async function recordPlay(
  config: AppConfig,
  user: UserRow,
  songId: string,
): Promise<ListenRow> {
  if (!(await songExists(config, songId))) {
    throw new SongNotFoundError(songId);
  }

  const now = Date.now();
  const last = await findLastListen(config, user.id);

  if (
    last !== null &&
    last.songId === songId &&
    now - last.playedAt.getTime() < DEDUPE_WINDOW_MS
  ) {
    return {
      ...last,
      // `id` nuevo a propósito (el de la fila vieja no se expone dos veces).
      id: crypto.randomUUID(),
    };
  }

  return insertListenWithCounters(config, {
    id: crypto.randomUUID(),
    userId: user.id,
    songId,
  });
}

/**
 * `GET /me/recently-played`: canciones sin duplicar, último play primero.
 *
 * 1 query agrupada para el ranking, 1 para el total, 3 del loader batcheado de
 * canciones y 1 agrupada para `user_play_count` — nunca N+1.
 */
export async function listRecentlyPlayed(
  config: AppConfig,
  user: UserRow,
  offset: number,
  limit: number,
): Promise<RecentlyPlayedPage> {
  const [songIds, total] = await Promise.all([
    listRecentlyPlayedSongIds(config, user.id, offset, limit),
    countDistinctPlayedSongs(config, user.id),
  ]);

  if (songIds.length === 0) return { items: [], total };

  const [songs, playCounts] = await Promise.all([
    findSongsByIds(config, songIds),
    countPlaysBySongForUser(config, user.id, songIds),
  ]);
  const byId = new Map(songs.map((song) => [song.id, song]));

  // `findSongsByIds` no garantiza orden: se reordena según el ranking.
  const items = songIds.flatMap((songId) => {
    const song = byId.get(songId);
    if (!song) return [];
    return [{ song, userPlayCount: playCounts.get(songId) ?? 0 }];
  });

  return { items, total };
}
