/**
 * Reglas de negocio de playlists (espejo de `features/playlists/service.py`).
 *
 * Sin HTTP: reciben el `AppConfig` y el usuario autenticado (o admin) y lanzan
 * errores de dominio que `onError` traduce al body de FastAPI.
 *
 * Visibilidad y mutabilidad:
 *   - ver: la playlist es pública o el usuario es el dueño (si no, 403);
 *   - mutar: SIEMPRE el dueño; si la playlist es `system`, además admin
 *     (`_get_mutable` de Python). Los snapshots solo los regenera un admin.
 */

import type { AppConfig } from "@/env";
import { ARTIST_TOP_QUERY, type UserRow } from "@/db/schema";
import { startOfUtcMonth } from "@/lib/datetime";
import {
  ArtistNotFoundError,
  ArtistWithoutSongsError,
  EssentialsAlreadyExistsError,
  PlaylistForbiddenError,
  PlaylistNotFoundError,
  PlaylistNotRefreshableError,
  PlaylistNotReseedableError,
  SongNotFoundError,
} from "@/lib/errors";
import { isUniqueViolation } from "@/lib/postgres";
import { topSongIds } from "@/repositories/listens";
import { findArtistById } from "@/repositories/artists";
import {
  addSongToPlaylist,
  countPlaylistsByOwner,
  countPublicPlaylists,
  createPlaylist,
  createPlaylistWithSongs,
  deletePlaylist,
  findArtistEssentials,
  findPlaylistWithOwner,
  listPlaylistsByOwner,
  listPublicPlaylists,
  loadPlaylistCollageCoverKeys,
  loadPlaylistItems,
  removeSongFromPlaylist,
  replacePlaylistSongs,
  updatePlaylist,
  type PlaylistPatch,
  type PlaylistWithItems,
  type PlaylistWithOwner,
  type PublicPlaylistFilters,
} from "@/repositories/playlists";
import {
  findSongsByPlaylistId,
  listNewestSongIds,
  songExists,
  topSongsByArtist,
  type SongWithRelations,
} from "@/repositories/songs";
import type {
  PlaylistCreate,
  PlaylistEssentialsCreate,
  PlaylistSystemCreate,
  PlaylistSystemQuery,
  PlaylistUpdate,
} from "@/schemas";
import { ESSENTIALS_LIMIT, PlaylistSystemQueryEnum } from "@/schemas";

/** Tamaño de los snapshots del sistema (top_week/top_month/new). */
export const SYSTEM_SNAPSHOT_LIMIT = 30;

/** `GET /playlists?mine=false`: tope del listado público filtrado por dueño. */
const PUBLIC_OWNER_LIMIT = 100;

/**
 * Tope de `GET /me/playlists` (sin paginar).
 *
 * El PlaylistPicker necesita la lista completa para marcar "ya está en esta
 * playlist", pero la respuesta no puede crecer sin límite: 200 playlists
 * cubren de sobra a un usuario real y acotan el payload. El listado paginado
 * (`/me/playlists/page`) NO usa este tope.
 */
export const MY_PLAYLISTS_LIMIT = 200;

/** `PlaylistDetail` a nivel dominio (el router serializa las canciones). */
export interface PlaylistDetailData {
  playlist: PlaylistWithOwner & { songCount: number; collageCoverKeys: string[] };
  songs: SongWithRelations[];
}

export interface PlaylistPage {
  items: PlaylistWithItems[];
  total: number;
}

function isAdmin(user: UserRow): boolean {
  return user.role === "admin" || user.isSuperuser;
}

/** `str.casefold`-like para query: solo valores del enum. */
function parseSystemQuery(value: string): PlaylistSystemQuery | null {
  return (PlaylistSystemQueryEnum.options as readonly string[]).includes(value)
    ? (value as PlaylistSystemQuery)
    : null;
}

/**
 * IDs del snapshot en orden de ranking. *
 * `topSongIds` ya viene ordenado por plays desc (desempate por `song_id`);
 * `new` usa el orden de creación desc.
 */
async function snapshotSongIds(
  config: AppConfig,
  query: PlaylistSystemQuery,
): Promise<string[]> {
  if (query === "top_week") {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const ranking = await topSongIds(config, {
      since,
      limit: SYSTEM_SNAPSHOT_LIMIT,
    });
    return ranking.map(({ songId }) => songId);
  }
  if (query === "top_month") {
    const ranking = await topSongIds(config, {
      since: startOfUtcMonth(new Date()),
      limit: SYSTEM_SNAPSHOT_LIMIT,
    });
    return ranking.map(({ songId }) => songId);
  }
  return listNewestSongIds(config, SYSTEM_SNAPSHOT_LIMIT);
}

/** Extracts up to 4 distinct album cover_keys in playlist order. */
function collageKeysFromSongs(songs: readonly SongWithRelations[]): string[] {
  const seen = new Set<string>();
  for (const song of songs) {
    const key = song.album?.coverKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (seen.size >= 4) break;
  }
  return [...seen];
}

/** Detalle completo (cabecera + dueño + canciones por posición). */
async function detailFor(
  config: AppConfig,
  playlistId: string,
  known?: PlaylistWithOwner,
): Promise<PlaylistDetailData> {
  const playlist = known ?? (await findPlaylistWithOwner(config, playlistId));
  if (!playlist) throw new PlaylistNotFoundError(playlistId);

  const songs = await findSongsByPlaylistId(config, playlistId);
  const collageCoverKeys = playlist.coverKey ? [] : collageKeysFromSongs(songs);
  return {
    playlist: { ...playlist, songCount: songs.length, collageCoverKeys },
    songs,
  };
}

/**
 * Playlist que el usuario puede MUTAR (`_get_mutable`): existe (404), es suya
 * (403) y, si es `system`, además tiene que ser admin (403).
 */
async function getMutable(
  config: AppConfig,
  playlistId: string,
  user: UserRow,
): Promise<PlaylistWithOwner> {
  const playlist = await findPlaylistWithOwner(config, playlistId);
  if (!playlist) throw new PlaylistNotFoundError(playlistId);
  if (playlist.ownerId !== user.id) throw new PlaylistForbiddenError();
  if (playlist.kind === "system" && !isAdmin(user)) {
    throw new PlaylistForbiddenError();
  }
  return playlist;
}

/**
 * Feed público: playlists públicas de TODOS (system primero).
 *
 * `search` filtra por nombre (`contains`, case-insensitive) y `artistId` por
 * CONTENIDO (alguna canción donde el artista participa, principal o
 * colaborador). Ambos aplican al listado y al total; el orden
 * (`systemFirstOrder`) no cambia.
 */
export async function listPublicCommunity(
  config: AppConfig,
  filters: PublicPlaylistFilters,
): Promise<PlaylistPage> {
  const [items, total] = await Promise.all([
    listPublicPlaylists(config, filters),
    // `PublicPlaylistFilters` es asignable a `PublicPlaylistConditions` (los
    // extra offset/limit se ignoran): pasar el objeto completo evita que un
    // filtro futuro aplique al listado y no al total en silencio.
    countPublicPlaylists(config, filters),
  ]);
  return { items, total };
}

/**
 * Playlists del usuario actual.
 * `publicOnly` (mine=false) = solo las públicas del mismo perfil (tope 100,
 * igual que el `list_public(limit=100)` de Python). Sin `publicOnly` se aplica
 * `MY_PLAYLISTS_LIMIT`: el picker las quiere todas, pero la respuesta está
 * acotada (el listado paginado no pasa por acá).
 */
export async function listPlaylistsForUser(
  config: AppConfig,
  user: UserRow,
  publicOnly: boolean,
): Promise<PlaylistWithItems[]> {
  if (publicOnly) {
    return listPublicPlaylists(config, {
      offset: 0,
      limit: PUBLIC_OWNER_LIMIT,
      ownerId: user.id,
    });
  }
  return listPlaylistsByOwner(config, user.id, 0, MY_PLAYLISTS_LIMIT);
}

/** Versión paginada (`GET /me/playlists/page`). */
export async function listPlaylistsForUserPage(
  config: AppConfig,
  user: UserRow,
  offset: number,
  limit: number,
): Promise<PlaylistPage> {
  const [items, total] = await Promise.all([
    listPlaylistsByOwner(config, user.id, offset, limit),
    countPlaylistsByOwner(config, user.id),
  ]);
  return { items, total };
}

/** Detalle con visibilidad: pública o del dueño (si no, 403). */
export async function getPlaylistDetail(
  config: AppConfig,
  playlistId: string,
  user: UserRow,
): Promise<PlaylistDetailData> {
  const playlist = await findPlaylistWithOwner(config, playlistId);
  if (!playlist) throw new PlaylistNotFoundError(playlistId);
  if (!playlist.isPublic && playlist.ownerId !== user.id) {
    throw new PlaylistForbiddenError();
  }
  return detailFor(config, playlistId, playlist);
}

/** `POST /playlists`: playlist de usuario vacía. */
export async function createPlaylistRecord(
  config: AppConfig,
  user: UserRow,
  payload: PlaylistCreate,
): Promise<PlaylistDetailData> {
  const created = await createPlaylist(config, {
    id: crypto.randomUUID(),
    ownerId: user.id,
    name: payload.name,
    description: payload.description ?? null,
    isPublic: payload.is_public,
    coverKey: payload.cover_key ?? null,
  });

  return {
    playlist: {
      ...created,
      ownerEmail: user.email,
      songCount: 0,
      collageCoverKeys: [],
    },
    songs: [],
  };
}

/**
 * `POST /playlists/system` (admin): snapshot de una query.
 *
 * La playlist guarda su `query` para poder regenerarse después con
 * `refreshSystemPlaylist` (mismo id, sin duplicar).
 *
 * La playlist y sus canciones se insertan en UN `db.batch` (una transacción del
 * lado de Neon): si falla el INSERT de items, no queda una playlist `system`
 * pública y vacía. El id se genera acá porque el batch no puede leer el
 * `returning()` de la primera sentencia.
 */
export async function createSystemPlaylist(
  config: AppConfig,
  admin: UserRow,
  payload: PlaylistSystemCreate,
): Promise<PlaylistDetailData> {
  const songIds = await snapshotSongIds(config, payload.query);
  const playlistId = crypto.randomUUID();

  await createPlaylistWithSongs(
    config,
    {
      id: playlistId,
      ownerId: admin.id,
      name: payload.name,
      description: payload.description ?? null,
      isPublic: true,
      kind: "system",
      query: payload.query,
    },
    songIds,
  );

  return detailFor(config, playlistId);
}

/**
 * `POST /playlists/system/essentials` (admin): playlist editorial del artista,
 * sembrada con sus canciones más escuchadas (all-time).
 *
 * Una sola Essentials por artista (unique parcial race-safe): el chequeo previo
 * da un 409 amable y el `23505` del índice también.
 */
export async function createArtistEssentials(
  config: AppConfig,
  admin: UserRow,
  payload: PlaylistEssentialsCreate,
): Promise<PlaylistDetailData> {
  const artist = await findArtistById(config, payload.artist_id);
  if (!artist) throw new ArtistNotFoundError(payload.artist_id);

  const songIds = await topSongsByArtist(
    config,
    payload.artist_id,
    payload.limit,
  );
  if (songIds.length === 0) {
    throw new ArtistWithoutSongsError(payload.artist_id);
  }

  if (await findArtistEssentials(config, payload.artist_id)) {
    throw new EssentialsAlreadyExistsError(payload.artist_id);
  }

  const playlistId = crypto.randomUUID();
  try {
    await createPlaylistWithSongs(
      config,
      {
        id: playlistId,
        ownerId: admin.id,
        name: payload.name ?? `${artist.name} Essentials`,
        description:
          payload.description ??
          `Lo esencial de ${artist.name}, curado por el sistema.`,
        isPublic: true,
        kind: "system",
        query: ARTIST_TOP_QUERY,
        artistId: payload.artist_id,
      },
      songIds,
    );
  } catch (error) {
    // Carrera entre el chequeo previo y el INSERT: el índice parcial decide.
    if (isUniqueViolation(error)) {
      throw new EssentialsAlreadyExistsError(payload.artist_id);
    }
    throw error;
  }

  return detailFor(config, playlistId);
}

/** `GET /playlists/system/essentials`: la Essentials del artista o `null`. */
export async function getArtistEssentials(
  config: AppConfig,
  artistId: string,
): Promise<PlaylistWithItems | null> {
  const playlist = await findArtistEssentials(config, artistId);
  if (!playlist) return null;

  const [withCount] = await withItems(config, [playlist]);
  return withCount ?? null;
}

/**
 * `POST /playlists/system/{id}/reseed` (admin): reemplaza las canciones por el
 * ranking actual del artista.
 *
 * Vuelve SIEMPRE al tope canónico `ESSENTIALS_LIMIT` (aunque la playlist se
 * haya creado con otro `limit`). Nombre, descripción y likes no se tocan.
 * Si el artista se quedó sin canciones → 404: nunca se destruye la curación
 * manual en silencio.
 *
 * El re-seed es explícito a propósito: el `refresh` automático no está
 * disponible para las Essentials (la curación manual manda).
 */
export async function reseedArtistEssentials(
  config: AppConfig,
  admin: UserRow,
  playlistId: string,
): Promise<PlaylistDetailData> {
  const playlist = await getMutable(config, playlistId, admin);

  if (playlist.query !== ARTIST_TOP_QUERY || playlist.artistId === null) {
    throw new PlaylistNotReseedableError(
      playlistId,
      "solo las Essentials por artista se re-siembran",
    );
  }

  const ranking = await topSongsByArtist(
    config,
    playlist.artistId,
    ESSENTIALS_LIMIT,
  );
  if (ranking.length === 0) {
    throw new ArtistWithoutSongsError(playlist.artistId);
  }

  await replacePlaylistSongs(config, playlistId, ranking);
  return detailFor(config, playlistId);
}

/** `POST /playlists/system/{id}/refresh` (admin): regenera el snapshot. */
export async function refreshSystemPlaylist(
  config: AppConfig,
  admin: UserRow,
  playlistId: string,
): Promise<PlaylistDetailData> {
  const playlist = await getMutable(config, playlistId, admin);

  if (playlist.kind !== "system") {
    throw new PlaylistNotRefreshableError(
      playlistId,
      "solo las playlists del sistema se regeneran",
    );
  }

  const rawQuery = playlist.query;
  if (rawQuery === null) {
    throw new PlaylistNotRefreshableError(
      playlistId,
      "esta playlist no tiene query de snapshot asociada " +
        "(fue creada antes de la migración 0008); recreala para poder refrescarla",
    );
  }

  // Las Essentials son editoriales: el refresh automático las borraría. El
  // escape hatch es el reseed explícito (POST /system/{id}/reseed).
  if (rawQuery === ARTIST_TOP_QUERY) {
    throw new PlaylistNotRefreshableError(
      playlistId,
      "las Essentials por artista no se refrescan: usá el re-seed explícito",
    );
  }

  const query = parseSystemQuery(rawQuery);
  if (query === null) {
    throw new PlaylistNotRefreshableError(
      playlistId,
      // `repr()` de Python para un str.
      `query de snapshot inválida ('${rawQuery}')`,
    );
  }

  await replacePlaylistSongs(
    config,
    playlistId,
    await snapshotSongIds(config, query),
  );
  return detailFor(config, playlistId);
}

/**
 * `PATCH /playlists/{id}` con semántica `exclude_unset`: se aplican solo las
 * claves presentes. `description: null` y `cover_key: null` SÍ limpian (como
 * Python); **`name: null` e `is_public: null` son un NO-OP** (no borran ni
 * rompen: en Python el `setattr(..., None)` chocaba con el NOT NULL y devolvía
 * 500). El contrato observable está documentado en la ruta OpenAPI.
 */
export async function updatePlaylistRecord(
  config: AppConfig,
  playlistId: string,
  user: UserRow,
  payload: PlaylistUpdate,
): Promise<PlaylistDetailData> {
  const playlist = await getMutable(config, playlistId, user);

  const patch: PlaylistPatch = {};
  if (payload.name !== undefined && payload.name !== null) {
    patch.name = payload.name;
  }
  if (payload.description !== undefined) {
    patch.description = payload.description;
  }
  if (payload.is_public !== undefined && payload.is_public !== null) {
    patch.isPublic = payload.is_public;
  }
  if (payload.cover_key !== undefined) {
    patch.coverKey = payload.cover_key;
  }

  const updated = await updatePlaylist(config, playlist.id, patch);
  if (!updated) throw new PlaylistNotFoundError(playlistId);

  return detailFor(config, playlistId);
}

export async function deletePlaylistRecord(
  config: AppConfig,
  playlistId: string,
  user: UserRow,
): Promise<void> {
  const playlist = await getMutable(config, playlistId, user);
  await deletePlaylist(config, playlist.id);
}

/** Agrega una canción al final; si ya está, es un no-op. */
export async function addSongRecord(
  config: AppConfig,
  playlistId: string,
  user: UserRow,
  songId: string,
): Promise<PlaylistDetailData> {
  const playlist = await getMutable(config, playlistId, user);

  if (!(await songExists(config, songId))) {
    throw new SongNotFoundError(songId);
  }

  await addSongToPlaylist(config, playlist.id, songId);
  return detailFor(config, playlistId);
}

/** Quita una canción y renumera; si no estaba en la playlist, 404. */
export async function removeSongRecord(
  config: AppConfig,
  playlistId: string,
  user: UserRow,
  songId: string,
): Promise<PlaylistDetailData> {
  const playlist = await getMutable(config, playlistId, user);

  const removed = await removeSongFromPlaylist(config, playlist.id, songId);
  if (!removed) throw new SongNotFoundError(songId);

  return detailFor(config, playlistId);
}

/** Items de varias playlists, para armar `MyPlaylistRead.song_ids`. */
export async function withItems(
  config: AppConfig,
  items: readonly PlaylistWithOwner[],
): Promise<PlaylistWithItems[]> {
  const allIds = items.map((playlist) => playlist.id);
  const collageIds = items
    .filter((playlist) => !playlist.coverKey)
    .map((playlist) => playlist.id);

  const [byPlaylist, collageCovers] = await Promise.all([
    loadPlaylistItems(config, allIds),
    loadPlaylistCollageCoverKeys(config, collageIds),
  ]);
  return items.map((playlist) => ({
    ...playlist,
    items: byPlaylist.get(playlist.id) ?? [],
    collageCoverKeys: playlist.coverKey ? [] : (collageCovers.get(playlist.id) ?? []),
  }));
}
