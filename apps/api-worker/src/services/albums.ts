/**
 * Reglas de negocio de álbumes (espejo de `features/albums/service.py`).
 *
 * Sin HTTP: reciben el `AppConfig` del request y lanzan errores de dominio que
 * `onError` traduce al body de FastAPI. Los routers solo parsean y delegan.
 */

import type { AppConfig } from "@/env";
import {
  AlbumHasSongsError,
  AlbumNotFoundError,
  ArtistNotFoundError,
} from "@/lib/errors";
import {
  countAlbumSongs,
  countAlbums,
  createAlbum,
  deleteAlbum,
  findAlbumById,
  findAlbumWithArtist,
  listAlbums,
  updateAlbum,
  type AlbumFilters,
  type AlbumPatch,
  type AlbumWithArtist,
  type AlbumWithCount,
} from "@/repositories/albums";
import { findArtistById } from "@/repositories/artists";
import {
  findSongsByAlbumId,
  type SongWithRelations,
} from "@/repositories/songs";
import type { AlbumCreate, AlbumUpdate } from "@/schemas";

export interface AlbumListPage {
  items: AlbumWithCount[];
  total: number;
}

/**
 * `AlbumDetail`: álbum + canciones en orden de creación.
 * `song_count = songs.length` (igual que el `get_album` de Python).
 */
export interface AlbumDetailData {
  album: AlbumWithArtist;
  songs: SongWithRelations[];
}

export async function listAlbumPage(
  config: AppConfig,
  filters: AlbumFilters,
  offset: number,
  limit: number,
): Promise<AlbumListPage> {
  const [items, total] = await Promise.all([
    listAlbums(config, filters, offset, limit),
    countAlbums(config, filters),
  ]);
  return { items, total };
}

export async function getAlbumDetail(
  config: AppConfig,
  albumId: string,
): Promise<AlbumDetailData> {
  const album = await findAlbumWithArtist(config, albumId);
  if (!album) throw new AlbumNotFoundError(albumId);

  const songs = await findSongsByAlbumId(config, album.id);
  return { album, songs };
}

async function assertArtistExists(
  config: AppConfig,
  artistId: string,
): Promise<void> {
  const artist = await findArtistById(config, artistId);
  if (!artist) throw new ArtistNotFoundError(artistId);
}

export async function createAlbumRecord(
  config: AppConfig,
  payload: AlbumCreate,
): Promise<AlbumDetailData> {
  await assertArtistExists(config, payload.artist_id);

  const created = await createAlbum(config, {
    id: crypto.randomUUID(),
    title: payload.title,
    artistId: payload.artist_id,
    coverKey: payload.cover_key ?? null,
  });

  // Re-fetch con el artista (y `songs: []` en el detalle).
  const detail = await getAlbumDetail(config, created.id);
  return detail;
}

/**
 * `PATCH /albums/{id}`: semántica de Python (`if value is not None`), no
 * `exclude_unset`: `null` en cualquier campo se IGNORA (no borra el cover).
 *
 * Existencia con una query liviana (sin join ni canciones): el detalle inflado
 * se pide UNA vez, al final, para armar la response.
 */
export async function updateAlbumRecord(
  config: AppConfig,
  albumId: string,
  payload: AlbumUpdate,
): Promise<AlbumDetailData> {
  const album = await findAlbumById(config, albumId);
  if (!album) throw new AlbumNotFoundError(albumId);

  const patch: AlbumPatch = {};
  if (payload.title !== undefined && payload.title !== null) {
    patch.title = payload.title;
  }
  if (payload.artist_id !== undefined && payload.artist_id !== null) {
    await assertArtistExists(config, payload.artist_id);
    patch.artistId = payload.artist_id;
  }
  if (payload.cover_key !== undefined && payload.cover_key !== null) {
    patch.coverKey = payload.cover_key;
  }

  const updated = await updateAlbum(config, album.id, patch);
  if (!updated) throw new AlbumNotFoundError(albumId);
  return getAlbumDetail(config, updated.id);
}

/**
 * `DELETE /albums/{id}`: un álbum con canciones no se borra (quedarían
 * huérfanas y sin cover). COUNT en DB, sin traer las filas.
 */
export async function deleteAlbumRecord(
  config: AppConfig,
  albumId: string,
): Promise<void> {
  const album = await findAlbumWithArtist(config, albumId);
  if (!album) throw new AlbumNotFoundError(albumId);

  const songCount = await countAlbumSongs(config, album.id);
  if (songCount > 0) throw new AlbumHasSongsError(album.id, songCount);

  await deleteAlbum(config, album.id);
}
