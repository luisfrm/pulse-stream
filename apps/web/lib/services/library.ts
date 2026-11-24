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
 * Las 3 dependen sólo de la cookie, así que van EN PARALELO (antes eran dos
 * niveles serializados: sesión → ids+playlists en cada navegación). Para un
 * anónimo las dos de datos responden 401 al toque y se descartan al ver que no
 * hay sesión; si HAY sesión y una falla, el error se propaga como antes (error
 * boundary del área, nunca degradación silenciosa).
 *
 * Devuelve `null` si no hay sesión (la UI se renderiza sin acciones).
 * NUNCA se cachea: son datos por usuario (cache: "no-store").
 */
export async function getUserLibrary(): Promise<UserLibrary | null> {
  const [user, ids, playlists] = await Promise.all([
    getSession(),
    favoritesService.getLibraryIds().catch((error: unknown) => ({ error })),
    playlistsService.getMyPlaylists().catch((error: unknown) => ({ error })),
  ]);

  if (!user) return null;
  if ("error" in ids) throw ids.error;
  if ("error" in playlists) throw playlists.error;

  return {
    favoriteIds: new Set(ids.song_ids),
    albumIds: new Set(ids.album_ids),
    playlistIds: new Set(ids.playlist_ids),
    playlists,
  };
}
