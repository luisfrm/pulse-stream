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
 * Radio encadenada de una canción (Q4 — autoplay al agotar el contexto, como
 * el "Autoplay" de Spotify): primero el top del artista de la canción por
 * plays y, cuando se seca, canciones de sus mismos GÉNEROS por plays.
 *
 * Se construye LATE-BINDING —al agotarse el contexto anterior, cuando ya se
 * conoce TODO lo reproducido— y `excludeIds` hornea esas exclusiones: las
 * páginas devuelven SOLO canciones nuevas (cursor interno; el offset del
 * motor se ignora). Así el dedupe del motor nunca ve una página "sin
 * novedades" mientras la radio todavía tiene contenido (el falso-agotado).
 *
 * Sin `total`: la radio se agota cuando sus fuentes devuelven una página
 * corta o cero items nuevos.
 */
export function radioContext(args: {
  seed: Song;
  excludeIds: ReadonlySet<string>;
}): PlayContext {
  const { seed, excludeIds } = args;
  /** Ya servidas (o excluidas): filtrado O(1) por id. */
  const served = new Set<string>(excludeIds);
  served.add(seed.id);
  const genres = [...new Set(seed.genres ?? [])];

  /**
   * Cursor interno multi-fuente: `source 0` = top del artista; `source n`
   * (1..genres.length) = canciones del género `genres[n-1]`. Cada fuente se
   * pagina con su propio offset y se abandona cuando devuelve una página
   * corta (las fuentes son rankings estables, no mutan entre páginas).
   */
  let source = 0;
  let cursor = 0;

  /**
   * Acumula lo NUEVO de una página de fuente sin pasarse de `limit` y devuelve
   * cuántos ítems del cursor se consumieron. Los que quedan fuera NO se marcan
   * `served` y el cursor no los salta: la próxima página de la fuente los
   * vuelve a traer (antes un `slice` los descartaba ya marcados como servidos).
   */
  function drain(items: Song[], out: Song[], limit: number): number {
    let consumed = 0;
    for (const item of items) {
      if (out.length >= limit) break;
      consumed += 1;
      if (!served.has(item.id)) {
        served.add(item.id);
        out.push(item);
      }
    }
    return consumed;
  }

  async function pull(limit: number): Promise<Song[]> {
    const out: Song[] = [];
    while (out.length < limit && source <= genres.length) {
      if (source === 0) {
        const page = await songsService.getSongs({
          artistId: seed.artist.id,
          sort: "plays",
          offset: cursor,
          limit: 50,
        });
        cursor += drain(page.items, out, limit);
        if (page.items.length < 50) {
          source = 1;
          cursor = 0;
        }
      } else {
        const genre = genres[source - 1];
        if (!genre) {
          source += 1;
          cursor = 0;
          continue;
        }
        const page = await songsService.getSongs({
          genre,
          sort: "plays",
          offset: cursor,
          limit: 50,
        });
        cursor += drain(page.items, out, limit);
        if (page.items.length < 50) {
          source += 1;
          cursor = 0;
        }
      }
    }
    // `drain` nunca pasa de `limit`: la página cumple el contrato de
    // `loadPage` sin recortar (recortar perdería canciones no entregadas).
    return out;
  }

  return {
    label: `Radio de ${seed.artist.name}`,
    key: `radio:${seed.id}`,
    loadPage: async (_offset, limit) => pull(limit),
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
  let inflight: Promise<Song[]> | null = null;

  return {
    label: `Álbum: ${args.albumTitle}`,
    key: `album:${args.albumId}`,
    total: args.total,
    loadPage: async (offset, limit) => {
      if (!loaded) {
        if (!inflight) {
          inflight = albumsService
            .getAlbumById(args.albumId)
            .then((album) => {
              loaded = album.songs ?? [];
              return loaded;
            })
            .finally(() => {
              inflight = null;
            });
        }
        const songs = await inflight;
        return songs.slice(offset, offset + limit);
      }
      return loaded.slice(offset, offset + limit);
    },
  };
}
