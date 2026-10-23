/**
 * Acceso a datos de álbumes (espejo de `features/albums/repository.py`).
 *
 * `song_count` se calcula en la DB con un LEFT JOIN agrupado (nunca N+1) y el
 * artista viaja en el mismo SELECT para armar `AlbumRead.artist`.
 */

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import {
  albums,
  artists,
  songs,
  type AlbumRow,
  type ArtistRow,
  type NewAlbumRow,
} from "@/db/schema";
import type { AppConfig } from "@/env";

/** Álbum + artista eager-loaded (lo que exige `AlbumRead.artist`). */
export type AlbumWithArtist = AlbumRow & { artist: ArtistRow };

/** Fila de listado: álbum + artista + `song_count` calculado. */
export type AlbumWithCount = AlbumWithArtist & { songCount: number };

/** Columnas que la API puede escribir en un álbum existente. */
export type AlbumPatch = Partial<
  Pick<NewAlbumRow, "title" | "artistId" | "coverKey">
>;

export interface AlbumFilters {
  search?: string | null;
  artistId?: string | null;
}

function albumConditions(filters: AlbumFilters) {
  const conditions = [];
  if (filters.search) {
    conditions.push(sql`${albums.title} ILIKE ${`%${filters.search}%`}`);
  }
  if (filters.artistId) {
    conditions.push(eq(albums.artistId, filters.artistId));
  }
  return conditions;
}

/**
 * `GET /albums`: nuevos primero, con `song_count` (LEFT JOIN + GROUP BY).
 *
 * Desempate por `id`: Python ordenaba solo por `created_at` y dos álbumes
 * creados en el mismo batch de tests salían en orden arbitrario. Con el
 * desempate la paginación es estable (mejora chica sobre el backend Python).
 */
export async function listAlbums(
  config: AppConfig,
  filters: AlbumFilters,
  offset: number,
  limit: number,
): Promise<AlbumWithCount[]> {
  const rows = await createDb(config)
    .select({
      album: albums,
      artist: artists,
      songCount: count(songs.id),
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .leftJoin(songs, eq(songs.albumId, albums.id))
    .where(and(...albumConditions(filters)))
    .groupBy(albums.id, artists.id)
    .orderBy(desc(albums.createdAt), asc(albums.id))
    .offset(offset)
    .limit(limit);

  return rows.map(({ album, artist, songCount }) => ({
    ...album,
    artist,
    songCount,
  }));
}

/** `total` del listado: mismo filtro que `listAlbums` (sin join de canciones). */
export async function countAlbums(
  config: AppConfig,
  filters: AlbumFilters,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(albums)
    .where(and(...albumConditions(filters)));
  return rows[0]?.value ?? 0;
}

/**
 * Fila pelada del álbum, sin join ni canciones: chequeo de existencia de los
 * PATCH (traer el detalle entero solo para saber si existe es doble trabajo).
 */
export async function findAlbumById(
  config: AppConfig,
  id: string,
): Promise<AlbumRow | null> {
  const rows = await createDb(config)
    .select()
    .from(albums)
    .where(eq(albums.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Álbum + artista (sin canciones): validaciones y respuestas puntuales. */
export async function findAlbumWithArtist(
  config: AppConfig,
  id: string,
): Promise<AlbumWithArtist | null> {
  const rows = await createDb(config)
    .select({ album: albums, artist: artists })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(eq(albums.id, id))
    .limit(1);

  const row = rows[0];
  return row ? { ...row.album, artist: row.artist } : null;
}

/** COUNT en DB de las canciones del álbum (sin traer las filas). */
export async function countAlbumSongs(
  config: AppConfig,
  albumId: string,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(songs)
    .where(eq(songs.albumId, albumId));
  return rows[0]?.value ?? 0;
}

export async function createAlbum(
  config: AppConfig,
  values: NewAlbumRow,
): Promise<AlbumRow> {
  const rows = await createDb(config).insert(albums).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("INSERT de álbum no devolvió fila");
  return row;
}

/**
 * UPDATE parcial + `updated_at` con `now()` de Postgres (el `onupdate` de
 * SQLAlchemy del backend Python ya no existe acá).
 */
export async function updateAlbum(
  config: AppConfig,
  id: string,
  patch: AlbumPatch,
): Promise<AlbumRow | null> {
  if (Object.keys(patch).length === 0) return findAlbumById(config, id);

  const rows = await createDb(config)
    .update(albums)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(albums.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteAlbum(config: AppConfig, id: string): Promise<void> {
  await createDb(config).delete(albums).where(eq(albums.id, id));
}
