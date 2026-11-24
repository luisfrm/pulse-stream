import { albumsService } from "@/lib/services/albums-service";
import { favoritesService } from "@/lib/services/favorites-service";
import { songsService } from "@/lib/services/songs-service";
import type { Song } from "@/lib/services/types";

import type { PlayContext } from "./player-provider";

/**
 * Fábricas de `PlayContext`: la única pieza reutilizable que convierte una
 * superficie (playlist, artista, búsqueda…) en un descriptor perezoso.
 *
 * Todas reciben la página ya renderizada (`seed`) para no repetir el fetch que
 * el usuario ya pagó. Un contexto FINITO es el que se pasa como array: acá solo
 * viven los paginables (y el álbum, que se resuelve de una sola vez).
 */

/** Key opaca del contexto de una playlist (para `contextKey`). */
export function playlistContextKey(playlistId: string): string {
  return `playlist:${playlistId}`;
}

/** Playlist: orden por posición (`GET /songs?playlist_id`). */
export function playlistContext(args: {
  playlistId: string;
  playlistName: string;
  seed: Song[];
  total?: number;
}): PlayContext {
  return {
    label: `Playlist: ${args.playlistName}`,
    key: playlistContextKey(args.playlistId),
    seed: args.seed,
    total: args.total,
    loadPage: async (offset, limit) =>
      (
        await songsService.getSongs({
          playlistId: args.playlistId,
          offset,
          limit,
        })
      ).items,
  };
}

/** Populares de un artista: ranking all-time (`sort=plays`). */
export function artistTopContext(args: {
  artistId: string;
  artistName: string;
  seed: Song[];
  total?: number;
}): PlayContext {
  return {
    label: `Populares de ${args.artistName}`,
    key: `artist:${args.artistId}:top`,
    seed: args.seed,
    total: args.total,
    loadPage: async (offset, limit) =>
      (
        await songsService.getSongs({
          artistId: args.artistId,
          sort: "plays",
          offset,
          limit,
        })
      ).items,
  };
}

/** Colaboraciones de un artista (invitado, no principal). */
export function artistCollaborationsContext(args: {
  artistId: string;
  artistName: string;
  seed: Song[];
  total?: number;
}): PlayContext {
  return {
    label: `Colaboraciones de ${args.artistName}`,
    key: `artist:${args.artistId}:collaborations`,
    seed: args.seed,
    total: args.total,
    loadPage: async (offset, limit) =>
      (
        await songsService.getSongs({
          collaboratorId: args.artistId,
          offset,
          limit,
        })
      ).items,
  };
}

/** Resultados de búsqueda de canciones (mismo orden que la lista: plays). */
export function searchContext(args: {
  query: string;
  seed: Song[];
  total?: number;
}): PlayContext {
  return {
    label: `Resultados de "${args.query}"`,
    key: `search:${args.query.toLowerCase()}`,
    seed: args.seed,
    total: args.total,
    loadPage: async (offset, limit) =>
      (
        await songsService.getSongs({
          query: args.query || undefined,
          sort: "plays",
          offset,
          limit,
        })
      ).items,
  };
}

/** Explorar canciones (`/songs`): mismo filtro q/género y orden default. */
export function catalogSongsContext(args: {
  query?: string;
  genre?: string;
  seed: Song[];
  total?: number;
}): PlayContext {
  return {
    label: "Explorar canciones",
    key: `catalog-songs:${args.query ?? ""}:${args.genre ?? ""}`,
    seed: args.seed,
    total: args.total,
    loadPage: async (offset, limit) =>
      (
        await songsService.getSongs({
          query: args.query || undefined,
          genre: args.genre || undefined,
          offset,
          limit,
        })
      ).items,
  };
}

/** Tus canciones (`/me/favorites`, orden por fecha del like). */
export function favoriteSongsContext(args: {
  seed: Song[];
  total?: number;
}): PlayContext {
  return {
    label: "Tus canciones",
    key: "favorites",
    seed: args.seed,
    total: args.total,
    loadPage: async (offset, limit) =>
      (await favoritesService.getFavorites({ offset, limit })).items,
  };
}

/**
 * Cola anclada a UNA canción suelta: `[canción elegida] + top del artista por
 * plays` (el patrón de "radio" de Spotify: elegís un tema y sigue más del
 * artista aunque no estuviera en la lista de donde vino).
 *
 * Arranca YA con `seed = [song]`: el audio no espera ningún fetch; el resto
 * llega por `loadPage`.
 *
 * OJO con el invariante del motor: acá el seed NO es el prefijo del orden de
 * páginas (el orden virtual es `[song, ...top sin song]`). Se compensa con
 * `offset - 1` en el fetch y un `limit + 1` para no marcar "agotado" antes de
 * tiempo cuando la canción cae dentro de la página pedida. La dedupe del motor
 * cubre cualquier solapamiento del borde entre páginas.
 */
export function songAnchoredContext(args: {
  song: Song;
  /** Total virtual (normalmente el total de canciones del artista). */
  total?: number;
}): PlayContext {
  const { song } = args;

  return {
    label: `Radio de ${song.artist.name}`,
    key: `radio:${song.artist.id}:${song.id}`,
    seed: [song],
    total: args.total,
    loadPage: async (offset, limit) => {
      const page = await songsService.getSongs({
        artistId: song.artist.id,
        sort: "plays",
        offset: Math.max(offset - 1, 0),
        // +1: compensa la canción anclada si entra en esta página; clamp al
        // tope de la API (un limit de 101 daría 422 y agotaría la radio).
        limit: Math.min(limit + 1, 100),
      });
      return page.items
        .filter((item) => item.id !== song.id)
        .slice(0, limit);
    },
  };
}

/**
 * Álbum: UNA sola fetch completa (`GET /albums/{id}` ya devuelve TODAS las
 * canciones y en orden de creación ASC = orden de track). El resto son slices
 * del array cacheado, así no hay paginación real ni orden invertido.
 */
export function albumContext(args: {
  albumId: string;
  albumTitle: string;
  total?: number;
}): PlayContext {
  let loaded: Song[] | null = null;

  return {
    label: `Álbum: ${args.albumTitle}`,
    key: `album:${args.albumId}`,
    total: args.total,
    loadPage: async (offset, limit) => {
      if (!loaded) {
        loaded = (await albumsService.getAlbumById(args.albumId)).songs ?? [];
      }
      return loaded.slice(offset, offset + limit);
    },
  };
}
