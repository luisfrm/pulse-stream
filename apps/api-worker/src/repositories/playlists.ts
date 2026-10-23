/**
 * Acceso a datos de playlists (espejo de `features/playlists/repository.py`).
 *
 * Reglas de carga (sin N+1):
 *   - cabecera + dueño: 1 query con join a `users` (siempre hace falta
 *     `owner_email`);
 *   - items (`song_id`/`position`): 1 query batcheada para TODAS las playlists
 *     de la página (nunca una por playlist);
 *   - canciones del detalle: `songs/repository.findSongsByPlaylistId` (loader
 *     batcheado de relaciones).
 *
 * Escrituras compuestas (reemplazo del snapshot, quitar + renumerar) van en UN
 * `db.batch`: el driver HTTP de Neon no soporta transacciones interactivas.
 */

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import {
  playlistSongs,
  playlists,
  users,
  type NewPlaylistRow,
  type PlaylistRow,
} from "@/db/schema";
import type { AppConfig } from "@/env";

/** Cabecera de playlist + email del dueño (lo que exige `PlaylistRead`). */
export type PlaylistWithOwner = PlaylistRow & { ownerEmail: string | null };

/** Fila de `playlist_songs` (solo lo que necesita `song_ids`/`song_count`). */
export interface PlaylistItem {
  playlistId: string;
  songId: string;
  position: number;
}

/** Playlist + items cargados (para `song_ids` de `MyPlaylistRead`). */
export type PlaylistWithItems = PlaylistWithOwner & { items: PlaylistItem[] };

/** Columnas que la API puede escribir en una playlist existente. */
export type PlaylistPatch = Partial<
  Pick<NewPlaylistRow, "name" | "description" | "isPublic" | "coverKey">
>;

/** `playlists.kind` es VARCHAR: cualquier valor distinto de "system" es "user". */
function systemFirstOrder() {
  // Postgres ordena `false` antes de `true`: las del sistema primero.
  return [sql`(${playlists.kind} <> 'system')`, desc(playlists.createdAt), asc(playlists.id)];
}

/** Cabecera + dueño por id (sin items ni canciones). */
export async function findPlaylistWithOwner(
  config: AppConfig,
  id: string,
): Promise<PlaylistWithOwner | null> {
  const rows = await createDb(config)
    .select({ playlist: playlists, ownerEmail: users.email })
    .from(playlists)
    .innerJoin(users, eq(playlists.ownerId, users.id))
    .where(eq(playlists.id, id))
    .limit(1);

  const row = rows[0];
  return row ? { ...row.playlist, ownerEmail: row.ownerEmail } : null;
}

/**
 * Items (`song_id` + `position`) de un conjunto de playlists en UNA query.
 * Devuelve un Map vacío para las playlists sin canciones.
 */
export async function loadPlaylistItems(
  config: AppConfig,
  playlistIds: readonly string[],
): Promise<Map<string, PlaylistItem[]>> {
  const byPlaylist = new Map<string, PlaylistItem[]>();
  if (playlistIds.length === 0) return byPlaylist;

  const rows = await createDb(config)
    .select({
      playlistId: playlistSongs.playlistId,
      songId: playlistSongs.songId,
      position: playlistSongs.position,
    })
    .from(playlistSongs)
    .where(inArray(playlistSongs.playlistId, [...playlistIds]))
    .orderBy(asc(playlistSongs.position), asc(playlistSongs.songId));

  for (const row of rows) {
    const list = byPlaylist.get(row.playlistId) ?? [];
    list.push(row);
    byPlaylist.set(row.playlistId, list);
  }
  return byPlaylist;
}

/** Playlists del dueño (más nuevas primero) + items cargados. */
export async function listPlaylistsByOwner(
  config: AppConfig,
  ownerId: string,
  offset = 0,
  limit?: number,
): Promise<PlaylistWithItems[]> {
  const db = createDb(config);
  let query = db
    .select({ playlist: playlists, ownerEmail: users.email })
    .from(playlists)
    .innerJoin(users, eq(playlists.ownerId, users.id))
    .where(eq(playlists.ownerId, ownerId))
    .orderBy(desc(playlists.createdAt), asc(playlists.id))
    .$dynamic();

  if (offset > 0) query = query.offset(offset);
  if (limit !== undefined) query = query.limit(limit);

  const rows = await query;
  const items = await loadPlaylistItems(
    config,
    rows.map(({ playlist }) => playlist.id),
  );

  return rows.map(({ playlist, ownerEmail }) => ({
    ...playlist,
    ownerEmail,
    items: items.get(playlist.id) ?? [],
  }));
}

export async function countPlaylistsByOwner(
  config: AppConfig,
  ownerId: string,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(playlists)
    .where(eq(playlists.ownerId, ownerId));
  return rows[0]?.value ?? 0;
}

export interface PublicPlaylistFilters {
  offset: number;
  limit: number;
  /** Filtro opcional por dueño (`GET /playlists?mine=false`). */
  ownerId?: string;
}

/**
 * Feed público: solo `is_public`, con las del sistema PRIMERO y después las
 * más nuevas. `song_count` sale de los items (query batcheada, sin canciones).
 */
export async function listPublicPlaylists(
  config: AppConfig,
  filters: PublicPlaylistFilters,
): Promise<PlaylistWithItems[]> {
  const conditions = [eq(playlists.isPublic, true)];
  if (filters.ownerId) conditions.push(eq(playlists.ownerId, filters.ownerId));

  const rows = await createDb(config)
    .select({ playlist: playlists, ownerEmail: users.email })
    .from(playlists)
    .innerJoin(users, eq(playlists.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(...systemFirstOrder())
    .offset(filters.offset)
    .limit(filters.limit);

  const items = await loadPlaylistItems(
    config,
    rows.map(({ playlist }) => playlist.id),
  );

  return rows.map(({ playlist, ownerEmail }) => ({
    ...playlist,
    ownerEmail,
    items: items.get(playlist.id) ?? [],
  }));
}

export async function countPublicPlaylists(
  config: AppConfig,
  ownerId?: string,
): Promise<number> {
  const conditions = [eq(playlists.isPublic, true)];
  if (ownerId) conditions.push(eq(playlists.ownerId, ownerId));

  const rows = await createDb(config)
    .select({ value: count() })
    .from(playlists)
    .where(and(...conditions));
  return rows[0]?.value ?? 0;
}

export async function createPlaylist(
  config: AppConfig,
  values: NewPlaylistRow & { id: string },
): Promise<PlaylistRow> {
  const rows = await createDb(config)
    .insert(playlists)
    .values(values)
    .returning();
  const row = rows[0];
  if (!row) throw new Error("INSERT de playlist no devolvió fila");
  return row;
}

/**
 * INSERT de la playlist + sus canciones en UNA transacción.
 *
 * `db.batch` viaja como una sola transacción al servidor de Neon: si el INSERT
 * de items falla, la playlist tampoco queda (nada de una `system` pública y
 * vacía). El id lo genera el service porque el batch no puede leer el
 * `returning()` de la primera sentencia.
 */
export async function createPlaylistWithSongs(
  config: AppConfig,
  values: NewPlaylistRow & { id: string },
  songIds: readonly string[],
): Promise<void> {
  const db = createDb(config);
  const insertPlaylist = db.insert(playlists).values(values);

  if (songIds.length === 0) {
    await db.batch([insertPlaylist] as const);
    return;
  }

  await db.batch([
    insertPlaylist,
    db.insert(playlistSongs).values(
      songIds.map((songId, position) => ({
        playlistId: values.id,
        songId,
        position,
      })),
    ),
  ] as const);
}

/** UPDATE parcial + `updated_at` con `now()` de Postgres. */
export async function updatePlaylist(
  config: AppConfig,
  id: string,
  patch: PlaylistPatch,
): Promise<PlaylistRow | null> {
  const rows = await createDb(config)
    .update(playlists)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(playlists.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deletePlaylist(
  config: AppConfig,
  id: string,
): Promise<void> {
  await createDb(config).delete(playlists).where(eq(playlists.id, id));
}

/**
 * Agrega una canción al final (posición = cantidad actual) en UNA sentencia.
 *
 * `INSERT ... SELECT ... WHERE NOT EXISTS` hace el no-op de "ya está" sin un
 * SELECT previo. La posición es una subconsulta escalar y NO un `count(*)` en
 * la lista del SELECT: un agregado con `WHERE` falso devuelve igual una fila
 * (con 0) y rompería la PK al repetir. `ON CONFLICT DO NOTHING` cubre la
 * carrera de dos requests concurrentes con la misma canción.
 */
export async function addSongToPlaylist(
  config: AppConfig,
  playlistId: string,
  songId: string,
): Promise<void> {
  await createDb(config).execute(sql`
    INSERT INTO "playlist_songs" ("playlist_id", "song_id", "position")
    SELECT ${playlistId}::uuid, ${songId}::uuid,
           (SELECT count(*) FROM "playlist_songs"
            WHERE "playlist_id" = ${playlistId}::uuid)
    WHERE NOT EXISTS (
      SELECT 1 FROM "playlist_songs"
      WHERE "playlist_id" = ${playlistId}::uuid
        AND "song_id" = ${songId}::uuid
    )
    ON CONFLICT ("playlist_id", "song_id") DO NOTHING
  `);
}

/**
 * Quita una canción y renumera las posiciones restantes 0..n-1.
 *
 * Ambas sentencias viajan en un `db.batch` (una transacción del lado de Neon):
 * si el DELETE no afectó filas, la renumeración es un no-op y se devuelve
 * `false` (el service responde 404).
 */
export async function removeSongFromPlaylist(
  config: AppConfig,
  playlistId: string,
  songId: string,
): Promise<boolean> {
  const db = createDb(config);

  const [removed] = await db.batch([
    db
      .delete(playlistSongs)
      .where(
        and(
          eq(playlistSongs.playlistId, playlistId),
          eq(playlistSongs.songId, songId),
        ),
      )
      .returning({ songId: playlistSongs.songId }),
    db.execute(sql`
      UPDATE "playlist_songs" AS target
      SET "position" = ranked.position - 1
      FROM (
        SELECT "song_id",
               row_number() OVER (ORDER BY "position", "song_id") AS position
        FROM "playlist_songs"
        WHERE "playlist_id" = ${playlistId}::uuid
      ) AS ranked
      WHERE target."playlist_id" = ${playlistId}::uuid
        AND target."song_id" = ranked."song_id"
    `),
  ] as const);

  return removed.length > 0;
}

/**
 * Reemplaza TODO el contenido (snapshot de una playlist del sistema).
 *
 * DELETE + INSERT de las posiciones 0..n-1 en un solo `db.batch`: o queda el
 * snapshot nuevo completo, o el viejo — nunca a medias ni duplicado.
 */
export async function replacePlaylistSongs(
  config: AppConfig,
  playlistId: string,
  songIds: readonly string[],
): Promise<void> {
  const db = createDb(config);
  const remove = db
    .delete(playlistSongs)
    .where(eq(playlistSongs.playlistId, playlistId));

  if (songIds.length === 0) {
    await db.batch([remove] as const);
    return;
  }

  await db.batch([
    remove,
    db.insert(playlistSongs).values(
      songIds.map((songId, position) => ({ playlistId, songId, position })),
    ),
  ] as const);
}
