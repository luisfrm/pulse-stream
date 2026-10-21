import { ForbiddenError, NotFoundError } from "../../lib/errors";
import type { UserRecord } from "../users/repository";
import type {
  AlbumRecord,
  ArtistRecord,
  PlaylistRecord,
  SongRecord,
} from "./repository";
import type { Page } from "./schema";

/**
 * Reglas de lectura (paginación, ventanas de tiempo, 404/403). Nada de SQL ni
 * de HTTP: las routes solo traducen.
 */

export function pageOf<T>(
  items: T[],
  total: number,
  offset: number,
  limit: number,
): Page<T> {
  return { items, total, offset, limit };
}

/**
 * Query flag (`true`/`false`/`1`/`0`) con default. FastAPI acepta esos 4
 * valores para un `bool = Query(...)`.
 */
export function flagToBool(
  value: "true" | "false" | "1" | "0" | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

/**
 * Inicio de la ventana de `/songs/popular`:
 * - `month` → primer día del mes calendario UTC;
 * - si no → `now - days`.
 */
export function resolveSince(
  days: number,
  month: boolean,
  now: Date = new Date(),
): Date {
  if (month) {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
  }
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function requireSong(row: SongRecord | null, id: string): SongRecord {
  if (!row) throw new NotFoundError(`Canción ${id} no existe`);
  return row;
}

export function requireAlbum(row: AlbumRecord | null, id: string): AlbumRecord {
  if (!row) throw new NotFoundError(`Álbum ${id} no existe`);
  return row;
}

export function requireArtist(
  row: ArtistRecord | null,
  id: string,
): ArtistRecord {
  if (!row) throw new NotFoundError(`Artista ${id} no existe`);
  return row;
}

/**
 * Detalle de playlist: 404 si no existe; 403 si es privada y el usuario no es
 * el dueño (las `system` son siempre públicas).
 */
export function requirePlaylistAccess(
  playlist: PlaylistRecord | null,
  id: string,
  user: UserRecord,
): PlaylistRecord {
  if (!playlist) throw new NotFoundError(`Playlist ${id} no existe`);
  if (!playlist.is_public && playlist.owner_id !== user.id) {
    throw new ForbiddenError("No tenés acceso a esta playlist");
  }
  return playlist;
}
