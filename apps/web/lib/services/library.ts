import { favoritesService } from "./favorites-service";
import { playlistsService } from "./playlists-service";
import { sessionService } from "./session-service";
import type { Playlist } from "./types";

export interface UserLibrary {
  favoriteIds: Set<string>;
  playlists: Playlist[];
}

/**
 * Datos de la biblioteca del usuario (favoritos + playlists) para pintar
 * corazones y menús "agregar a playlist" en listas de canciones.
 *
 * Devuelve `null` si no hay sesión (la UI se renderiza sin acciones).
 * NUNCA se cachea: son datos por usuario (cache: "no-store").
 */
export async function getUserLibrary(): Promise<UserLibrary | null> {
  const user = await sessionService.getSession();
  if (!user) return null;

  const [ids, playlists] = await Promise.all([
    favoritesService.getFavoriteIds(),
    playlistsService.getMyPlaylists(),
  ]);

  return { favoriteIds: new Set(ids), playlists };
}
