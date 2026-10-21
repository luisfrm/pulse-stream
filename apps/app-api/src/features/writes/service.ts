import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors";
import { mapPlaylistDetail, toIsoDate } from "../catalog/mappers";
import type { CatalogRepository, PlaylistRecord } from "../catalog/repository";
import type { PlaylistDetail } from "../catalog/schema";
import { requirePlaylistAccess } from "../catalog/service";
import type { UserRecord } from "../users/repository";
import { UsernameTakenError } from "../users/repository";
import type {
  ListenRecord,
  UpdateUserProfileFields,
  WritesRepository,
} from "./repository";

/**
 * Reglas de negocio de las escrituras (nada de SQL ni de HTTP). Las routes
 * solo validan input, llaman acá y mapean.
 */

export const PLAYLIST_FORBIDDEN_DETAIL = "No tenés acceso a esta playlist";
export const USERNAME_TAKEN_DETAIL = "El nombre de usuario ya está en uso";

/** `role === "admin"` o `is_superuser` (mismos permisos que Python). */
export function isAdmin(user: UserRecord): boolean {
  return user.role === "admin" || user.is_superuser;
}

/**
 * Playlist mutable por el usuario: existe (404), es suya (403) y, si es del
 * sistema, solo un admin puede tocarla (403). Espejo de
 * `PlaylistService._get_owned` + `_get_mutable`.
 */
export async function requireMutablePlaylist(
  catalog: CatalogRepository,
  playlistId: string,
  user: UserRecord,
): Promise<PlaylistRecord> {
  const detail = await catalog.getPlaylistWithSongs(playlistId);
  if (!detail) throw new NotFoundError(`Playlist ${playlistId} no existe`);
  if (detail.playlist.owner_id !== user.id) {
    throw new ForbiddenError(PLAYLIST_FORBIDDEN_DETAIL);
  }
  if (detail.playlist.kind === "system" && !isAdmin(user)) {
    throw new ForbiddenError(PLAYLIST_FORBIDDEN_DETAIL);
  }
  return detail.playlist;
}

/**
 * `PlaylistDetail` después de mutar: reusa `catalog.getPlaylistWithSongs` y
 * `mapPlaylistDetail` (no se duplica el mapper de Fase 2).
 */
export async function loadPlaylistDetail(
  catalog: CatalogRepository,
  playlistId: string,
  user: UserRecord,
  baseUrl: string,
): Promise<PlaylistDetail> {
  const detail = await catalog.getPlaylistWithSongs(playlistId);
  const playlist = requirePlaylistAccess(
    detail?.playlist ?? null,
    playlistId,
    user,
  );
  return mapPlaylistDetail(playlist, detail?.songs ?? [], baseUrl);
}

/** Actualiza el perfil y traduce la unicidad de username a 400 `{detail}`. */
export async function updateProfile(
  writes: WritesRepository,
  user: UserRecord,
  fields: UpdateUserProfileFields,
): Promise<UserRecord> {
  try {
    return await writes.updateUserProfile(user.id, fields);
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      throw new BadRequestError(USERNAME_TAKEN_DETAIL);
    }
    throw error;
  }
}

/** `ListenRead` (fechas ISO-8601 UTC con microsegundos, como Python). */
export function toListenRead(listen: ListenRecord): {
  id: string;
  song_id: string;
  played_at: string;
} {
  return {
    id: listen.id,
    song_id: listen.song_id,
    played_at: toIsoDate(listen.played_at),
  };
}
