import { favoritesService } from "./favorites-service";
import { playlistsService } from "./playlists-service";
import { getSession } from "./session-service";
import type { MyPlaylist } from "./types";

export interface UserLibrary {
  favoriteIds: Set<string>;
  albumIds: Set<string>;
  playlistIds: Set<string>;
  /** Playlists del usuario con `song_ids` (para el PlaylistPicker). */
  playlists: MyPlaylist[];
}

/**
 * Datos de la biblioteca del usuario (favoritos + playlists) para pintar
 * corazones, menús "agregar a playlist" y likes en listas de canciones.
 *
 * Los 3 sets de IDs (canciones, álbumes, playlists) salen de UN solo
 * `GET /me/library/ids` — no de tres llamadas.
 *
 * Devuelve `null` si no hay sesión (la UI se renderiza sin acciones).
 * NUNCA se cachea: son datos por usuario (cache: "no-store").
 */
export async function getUserLibrary(): Promise<UserLibrary | null> {
  const user = await getSession();
  if (!user) return null;

  const [ids, playlists] = await Promise.all([
    favoritesService.getLibraryIds(),
    playlistsService.getMyPlaylists(),
  ]);

  return {
    favoriteIds: new Set(ids.song_ids),
    albumIds: new Set(ids.album_ids),
    playlistIds: new Set(ids.playlist_ids),
    playlists,
  };
}
