/**
 * Reglas de negocio de artistas (espejo de `features/artists/service.py`).
 *
 * Sin HTTP: reciben el `AppConfig` del request y lanzan errores de dominio que
 * `onError` traduce al body de FastAPI. Los routers solo parsean y delegan.
 */

import type { ArtistRow } from "@/db/schema";
import type { AppConfig } from "@/env";
import { ArtistNameTakenError, ArtistNotFoundError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/postgres";
import {
  countArtists,
  createArtist,
  deleteArtist,
  findArtistById,
  findArtistByName,
  listArtists,
  updateArtist,
  type ArtistPatch,
} from "@/repositories/artists";
import type { ArtistCreate, ArtistUpdate } from "@/schemas";

export interface ArtistListPage {
  items: ArtistRow[];
  total: number;
}

export async function listArtistPage(
  config: AppConfig,
  offset: number,
  limit: number,
  search?: string | null,
): Promise<ArtistListPage> {
  const [items, total] = await Promise.all([
    listArtists(config, offset, limit, search),
    countArtists(config, search),
  ]);
  return { items, total };
}

export async function getArtistOr404(
  config: AppConfig,
  artistId: string,
): Promise<ArtistRow> {
  const artist = await findArtistById(config, artistId);
  if (!artist) throw new ArtistNotFoundError(artistId);
  return artist;
}

export async function createArtistRecord(
  config: AppConfig,
  payload: ArtistCreate,
): Promise<ArtistRow> {
  const existing = await findArtistByName(config, payload.name);
  if (existing) throw new ArtistNameTakenError(payload.name);

  try {
    return await createArtist(config, {
      id: crypto.randomUUID(),
      name: payload.name,
      imageUrl: payload.image_url ?? null,
      coverKey: payload.cover_key ?? null,
    });
  } catch (error) {
    // Carrera entre el chequeo y el INSERT: `ix_artists_name` (exacto) devuelve
    // 23505 y el body debe ser el mismo 409, no un 500.
    if (isUniqueViolation(error)) throw new ArtistNameTakenError(payload.name);
    throw error;
  }
}

/**
 * `PATCH /artists/{id}` con semántica `exclude_unset`: solo se aplican las
 * claves presentes en el body. `name: null` explícito se ignora (la columna es
 * NOT NULL; Python reventaba con 500).
 */
export async function updateArtistRecord(
  config: AppConfig,
  artistId: string,
  payload: ArtistUpdate,
): Promise<ArtistRow> {
  const artist = await getArtistOr404(config, artistId);

  const patch: ArtistPatch = {};

  if (payload.name !== undefined && payload.name !== null) {
    if (payload.name !== artist.name) {
      const existing = await findArtistByName(config, payload.name, artist.id);
      if (existing) throw new ArtistNameTakenError(payload.name);
    }
    patch.name = payload.name;
  }
  if (payload.image_url !== undefined) patch.imageUrl = payload.image_url;
  if (payload.cover_key !== undefined) patch.coverKey = payload.cover_key;

  try {
    const updated = await updateArtist(config, artist.id, patch);
    return updated ?? artist;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ArtistNameTakenError(patch.name ?? "");
    throw error;
  }
}

/** `DELETE /artists/{id}`: la DB cascada álbumes y canciones. */
export async function deleteArtistRecord(
  config: AppConfig,
  artistId: string,
): Promise<void> {
  const artist = await getArtistOr404(config, artistId);
  await deleteArtist(config, artist.id);
}
