/**
 * Acceso a datos de artistas (espejo de `features/artists/repository.py`).
 *
 * Solo queries Drizzle: sin reglas de negocio ni HTTP. Cada función recibe el
 * `AppConfig` del request y construye su propio cliente (driver HTTP, sin
 * estado entre requests).
 */

import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";

import { createDb } from "@/db/client";
import { artists, type ArtistRow, type NewArtistRow } from "@/db/schema";
import type { AppConfig } from "@/env";

/** Columnas que la API puede escribir en un artista existente. */
export type ArtistPatch = Partial<
  Pick<NewArtistRow, "name" | "imageUrl" | "coverKey">
>;

/** Búsqueda por nombre case-insensitive (`Artist.name.ilike("%q%")`). */
function nameSearch(search: string | null | undefined) {
  if (!search) return undefined;
  return sql`${artists.name} ILIKE ${`%${search}%`}`;
}

/** `GET /artists`: orden `name asc`. */
export async function listArtists(
  config: AppConfig,
  offset: number,
  limit: number,
  search?: string | null,
): Promise<ArtistRow[]> {
  return createDb(config)
    .select()
    .from(artists)
    .where(nameSearch(search))
    .orderBy(asc(artists.name))
    .offset(offset)
    .limit(limit);
}

/** `total` del listado: mismo filtro que `listArtists`. */
export async function countArtists(
  config: AppConfig,
  search?: string | null,
): Promise<number> {
  const rows = await createDb(config)
    .select({ value: count() })
    .from(artists)
    .where(nameSearch(search));
  return rows[0]?.value ?? 0;
}

export async function findArtistById(
  config: AppConfig,
  id: string,
): Promise<ArtistRow | null> {
  const rows = await createDb(config)
    .select()
    .from(artists)
    .where(eq(artists.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ids existentes de un conjunto pedido, en UNA sola query.
 *
 * Es lo que usa el service para validar `collaborator_ids`: comparar el
 * conjunto devuelto contra el pedido evita el N+1 (una query por colaborador)
 * sin cambiar el error (el primer id faltante, en el orden del body).
 */
export async function findArtistIds(
  config: AppConfig,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];

  const rows = await createDb(config)
    .select({ id: artists.id })
    .from(artists)
    .where(inArray(artists.id, [...ids]));
  return rows.map((row) => row.id);
}

/**
 * Búsqueda por nombre case-insensitive (`func.lower(name) == name.lower()`).
 * `excludeId` ignora al propio artista al validar un PATCH.
 */
export async function findArtistByName(
  config: AppConfig,
  name: string,
  excludeId?: string,
): Promise<ArtistRow | null> {
  const lowered = name.toLowerCase();
  const where = excludeId
    ? and(sql`lower(${artists.name}) = ${lowered}`, ne(artists.id, excludeId))
    : sql`lower(${artists.name}) = ${lowered}`;

  const rows = await createDb(config)
    .select()
    .from(artists)
    .where(where)
    .limit(1);
  return rows[0] ?? null;
}

export async function createArtist(
  config: AppConfig,
  values: NewArtistRow,
): Promise<ArtistRow> {
  const rows = await createDb(config).insert(artists).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error("INSERT de artista no devolvió fila");
  return row;
}

/**
 * UPDATE parcial + `updated_at`. El timestamp lo pone Postgres (`now()`): una
 * sola sentencia, sin depender del reloj del Worker.
 */
export async function updateArtist(
  config: AppConfig,
  id: string,
  patch: ArtistPatch,
): Promise<ArtistRow | null> {
  if (Object.keys(patch).length === 0) return findArtistById(config, id);

  const rows = await createDb(config)
    .update(artists)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(artists.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Hard delete: las FKs `ON DELETE CASCADE` limpian álbumes y canciones. */
export async function deleteArtist(config: AppConfig, id: string): Promise<void> {
  await createDb(config).delete(artists).where(eq(artists.id, id));
}
