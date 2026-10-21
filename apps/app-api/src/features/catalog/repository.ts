import type { QueryResultRow, Queryable } from "../../db/types";
import {
  ALBUM_ARTIST_JOIN,
  ALBUM_SELECT,
  ARTIST_SELECT,
  artistJson,
  COLLABORATOR_JOIN,
  PLAYLIST_JOIN,
  PLAYLIST_JOINS,
  PLAYLIST_SELECT,
  PLAYLIST_SONG_IDS,
  SONG_JOINS,
  SONG_SELECT,
  utcTimestamp,
} from "./queries";
import type { PlaylistKind, PlaylistSystemQuery, SongGenre } from "./schema";

/**
 * Lecturas del catálogo + biblioteca del usuario.
 *
 * SQL parametrizado (nunca interpolación de valores). Un `Queryable` por
 * request compartido con `users` (`db/client.ts`); el repository no cierra la
 * conexión. Presupuesto: 1-3 queries por endpoint.
 */

export interface ArtistRecord extends QueryResultRow {
  id: string;
  name: string;
  image_url: string | null;
  cover_key: string | null;
  created_at: string;
}

export interface AlbumRecord extends QueryResultRow {
  id: string;
  title: string;
  artist: ArtistRecord;
  cover_key: string | null;
  created_at: string;
  song_count: number;
}

export interface SongRecord extends QueryResultRow {
  id: string;
  title: string;
  artist: ArtistRecord;
  album: AlbumRecord | null;
  genres: SongGenre[] | null;
  lyrics: string | null;
  object_key: string;
  duration_seconds: number | null;
  play_count: number;
  created_at: string;
  collaborators: ArtistRecord[] | null;
}

export interface PlaylistRecord extends QueryResultRow {
  id: string;
  kind: PlaylistKind;
  name: string;
  description: string | null;
  is_public: boolean;
  cover_key: string | null;
  query: PlaylistSystemQuery | null;
  /** Interno: dueño (control de acceso). No se expone en `PlaylistRead`. */
  owner_id: string;
  created_at: string;
  owner_email: string | null;
  song_count: number;
}

export interface MyPlaylistRecord extends PlaylistRecord {
  /** IDs en orden de `position`. */
  song_ids: string[];
}

export type SongWithWindowPlaysRecord = SongRecord & {
  /** Plays dentro de la ventana pedida (no el contador persistente). */
  window_play_count: number;
};

export type RecentlyPlayedRecord = SongRecord & {
  /** Veces que el usuario reprodujo la canción (histórico completo). */
  user_play_count: number;
};

export interface PageParams {
  offset: number;
  limit: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface ListSongsParams extends PageParams {
  search?: string | null;
  artistId?: string | null;
  collaboratorId?: string | null;
  albumId?: string | null;
  playlistId?: string | null;
}

export interface ListAlbumsParams extends PageParams {
  search?: string | null;
  artistId?: string | null;
}

export interface ListArtistsParams extends PageParams {
  search?: string | null;
}

export interface ListPopularSongsParams {
  /** ISO-8601: inicio de la ventana (`days` o mes calendario UTC). */
  since: string;
  limit: number;
}

export interface UserPageParams extends PageParams {
  userId: string;
}

export interface CatalogRepository {
  listSongs(params: ListSongsParams): Promise<PageResult<SongRecord>>;
  listPopularSongs(
    params: ListPopularSongsParams,
  ): Promise<SongWithWindowPlaysRecord[]>;
  getSongById(id: string): Promise<SongRecord | null>;

  listAlbums(params: ListAlbumsParams): Promise<PageResult<AlbumRecord>>;
  getAlbumWithSongs(
    id: string,
  ): Promise<{ album: AlbumRecord; songs: SongRecord[] } | null>;

  listArtists(params: ListArtistsParams): Promise<PageResult<ArtistRecord>>;
  getArtistById(id: string): Promise<ArtistRecord | null>;

  listPublicPlaylists(params: PageParams): Promise<PageResult<PlaylistRecord>>;
  listPlaylistsByOwner(ownerId: string): Promise<PlaylistRecord[]>;
  listPublicPlaylistsByOwner(ownerId: string): Promise<PlaylistRecord[]>;
  getPlaylistWithSongs(
    id: string,
  ): Promise<{ playlist: PlaylistRecord; songs: SongRecord[] } | null>;

  listFavoriteSongs(params: UserPageParams): Promise<PageResult<SongRecord>>;
  listFavoriteSongIds(userId: string): Promise<string[]>;
  listFavoriteAlbums(params: UserPageParams): Promise<PageResult<AlbumRecord>>;
  listFavoriteAlbumIds(userId: string): Promise<string[]>;
  listFavoritePlaylists(
    params: UserPageParams,
  ): Promise<PageResult<PlaylistRecord>>;
  listFavoritePlaylistIds(userId: string): Promise<string[]>;
  getLibraryIds(userId: string): Promise<{
    song_ids: string[];
    album_ids: string[];
    playlist_ids: string[];
  }>;

  listMyPlaylists(userId: string): Promise<MyPlaylistRecord[]>;
  listMyPlaylistsPage(
    params: UserPageParams,
  ): Promise<PageResult<MyPlaylistRecord>>;

  listRecentlyPlayed(
    params: UserPageParams,
  ): Promise<PageResult<RecentlyPlayedRecord>>;

  /** Cierra el cliente si el repository es dueño de uno (tests/producción). */
  close?(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface SongFilters {
  search?: string | null;
  artistId?: string | null;
  collaboratorId?: string | null;
  albumId?: string | null;
  playlistId?: string | null;
}

function whereClause(clauses: string[]): string {
  return clauses.length > 0 ? `WHERE ${clauses.join("\n    AND ")}` : "";
}

/** JOINs extra que exigen los filtros de `/songs`. */
function songFilterJoins(filters: SongFilters): string {
  const joins: string[] = [];
  if (filters.collaboratorId) joins.push(COLLABORATOR_JOIN);
  if (filters.playlistId) joins.push(PLAYLIST_JOIN);
  return joins.join("\n    ");
}

/**
 * Cláusulas de filtro de `/songs`. Los valores se empujan a `values` en orden,
 * así el placeholder es siempre `$${values.length}`.
 */
function songFilterClauses(
  filters: SongFilters,
  values: unknown[],
): string[] {
  const clauses: string[] = [];
  const param = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.search) {
    clauses.push(`s.title ILIKE ${param(`%${filters.search}%`)}`);
  }
  if (filters.artistId) {
    clauses.push(`s.artist_id = ${param(filters.artistId)}`);
  }
  if (filters.collaboratorId) {
    // Colaboración: el artista participa pero NO es el principal.
    // Sin DISTINCT: la PK (song_id, artist_id) no duplica filas.
    const placeholder = param(filters.collaboratorId);
    clauses.push(`filter_collaborator.artist_id = ${placeholder}`);
    clauses.push(`s.artist_id <> ${placeholder}`);
  }
  if (filters.albumId) {
    clauses.push(`s.album_id = ${param(filters.albumId)}`);
  }
  if (filters.playlistId) {
    clauses.push(`filter_playlist.playlist_id = ${param(filters.playlistId)}`);
  }

  return clauses;
}

/* -------------------------------------------------------------------------- */
/* Implementación `pg`                                                        */
/* -------------------------------------------------------------------------- */

export class PgCatalogRepository implements CatalogRepository {
  constructor(private readonly client: Queryable | null) {}

  private get db(): Queryable {
    if (!this.client) {
      throw new Error(
        "Database is not configured: set DATABASE_URL",
      );
    }
    return this.client;
  }

  private async rows<T extends QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.db.query<T>(text, values);
    return result.rows;
  }

  /* ------------------------------- songs --------------------------------- */

  async listSongs(params: ListSongsParams): Promise<PageResult<SongRecord>> {
    const values: unknown[] = [];
    const clauses = songFilterClauses(params, values);
    // Con playlist_id manda el orden manual (position); si no, más nuevas
    // primero. `s.id` como tie-breaker mantiene la paginación estable.
    const orderBy = params.playlistId
      ? "filter_playlist.position ASC"
      : "s.created_at DESC, s.title ASC, s.id ASC";

    const itemValues = [...values, params.limit, params.offset];
    const items = await this.rows<SongRecord>(
      `SELECT ${SONG_SELECT}
         FROM songs s
         ${SONG_JOINS}
         ${songFilterJoins(params)}
         ${whereClause(clauses)}
        ORDER BY ${orderBy}
        LIMIT $${itemValues.length - 1} OFFSET $${itemValues.length}`,
      itemValues,
    );

    const countValues: unknown[] = [];
    const countClauses = songFilterClauses(params, countValues);
    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM songs s
         ${songFilterJoins(params)}
         ${whereClause(countClauses)}`,
      countValues,
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async listPopularSongs(
    params: ListPopularSongsParams,
  ): Promise<SongWithWindowPlaysRecord[]> {
    // Ranking + canciones en una sola query (CTE).
    return await this.rows<SongWithWindowPlaysRecord>(
      `WITH ranking AS (
         SELECT listens.song_id, count(*)::int AS plays
           FROM listens
          WHERE listens.played_at >= $1
          GROUP BY listens.song_id
          ORDER BY plays DESC, listens.song_id ASC
          LIMIT $2
       )
       SELECT ${SONG_SELECT}, ranking.plays AS window_play_count
         FROM ranking
         JOIN songs s ON s.id = ranking.song_id
         ${SONG_JOINS}
        ORDER BY ranking.plays DESC, s.id ASC`,
      [params.since, params.limit],
    );
  }

  async getSongById(id: string): Promise<SongRecord | null> {
    const rows = await this.rows<SongRecord>(
      `SELECT ${SONG_SELECT}
         FROM songs s
         ${SONG_JOINS}
        WHERE s.id = $1
        LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /* ------------------------------- albums -------------------------------- */

  async listAlbums(params: ListAlbumsParams): Promise<PageResult<AlbumRecord>> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    const param = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (params.search) clauses.push(`a.title ILIKE ${param(`%${params.search}%`)}`);
    if (params.artistId) clauses.push(`a.artist_id = ${param(params.artistId)}`);

    const itemValues = [...values, params.limit, params.offset];
    const items = await this.rows<AlbumRecord>(
      `SELECT ${ALBUM_SELECT}
         FROM albums a
         ${ALBUM_ARTIST_JOIN}
         LEFT JOIN songs s ON s.album_id = a.id
         ${whereClause(clauses)}
        GROUP BY a.id, a_artist.id
        ORDER BY a.created_at DESC, a.id ASC
        LIMIT $${itemValues.length - 1} OFFSET $${itemValues.length}`,
      itemValues,
    );

    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM albums a
         ${whereClause(clauses)}`,
      values,
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async getAlbumWithSongs(
    id: string,
  ): Promise<{ album: AlbumRecord; songs: SongRecord[] } | null> {
    const albums = await this.rows<AlbumRecord>(
      `SELECT a.id,
              a.title,
              a.cover_key,
              to_json(${utcTimestamp("a.created_at")}) AS created_at,
              (SELECT count(*)::int
                 FROM songs counted
                WHERE counted.album_id = a.id) AS song_count,
              ${artistJson("a_artist")} AS artist
         FROM albums a
         ${ALBUM_ARTIST_JOIN}
        WHERE a.id = $1
        LIMIT 1`,
      [id],
    );

    const album = albums[0];
    if (!album) return null;

    // Orden de inserción (created_at asc) = orden de `Album.songs` en Python.
    const songs = await this.rows<SongRecord>(
      `SELECT ${SONG_SELECT}
         FROM songs s
         ${SONG_JOINS}
        WHERE s.album_id = $1
        ORDER BY s.title ASC, s.id ASC`,
      [id],
    );

    return { album, songs };
  }

  /* ------------------------------- artists ------------------------------- */

  async listArtists(
    params: ListArtistsParams,
  ): Promise<PageResult<ArtistRecord>> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (params.search) {
      values.push(`%${params.search}%`);
      clauses.push(`a.name ILIKE $${values.length}`);
    }

    const itemValues = [...values, params.limit, params.offset];
    const items = await this.rows<ArtistRecord>(
      `SELECT ${ARTIST_SELECT}
         FROM artists a
         ${whereClause(clauses)}
        ORDER BY a.name ASC, a.id ASC
        LIMIT $${itemValues.length - 1} OFFSET $${itemValues.length}`,
      itemValues,
    );

    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM artists a
         ${whereClause(clauses)}`,
      values,
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async getArtistById(id: string): Promise<ArtistRecord | null> {
    const rows = await this.rows<ArtistRecord>(
      `SELECT ${ARTIST_SELECT} FROM artists a WHERE a.id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /* ------------------------------ playlists ------------------------------ */

  async listPublicPlaylists(
    params: PageParams,
  ): Promise<PageResult<PlaylistRecord>> {
    // System primero (curadas), después las nuevas por fecha.
    const items = await this.rows<PlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}
         FROM playlists p
         ${PLAYLIST_JOINS}
        WHERE p.is_public
        ORDER BY (p.kind <> 'system') ASC, p.created_at DESC, p.id ASC
        LIMIT $1 OFFSET $2`,
      [params.limit, params.offset],
    );

    const countRows = await this.rows<{ total: number }>(
      "SELECT count(*)::int AS total FROM playlists p WHERE p.is_public",
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async listPlaylistsByOwner(ownerId: string): Promise<PlaylistRecord[]> {
    return await this.rows<PlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}
         FROM playlists p
         ${PLAYLIST_JOINS}
        WHERE p.owner_id = $1
        ORDER BY p.created_at DESC, p.id ASC`,
      [ownerId],
    );
  }

  async listPublicPlaylistsByOwner(ownerId: string): Promise<PlaylistRecord[]> {
    return await this.rows<PlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}
         FROM playlists p
         ${PLAYLIST_JOINS}
        WHERE p.owner_id = $1
          AND p.is_public
        ORDER BY p.created_at DESC, p.id ASC`,
      [ownerId],
    );
  }

  async getPlaylistWithSongs(
    id: string,
  ): Promise<{ playlist: PlaylistRecord; songs: SongRecord[] } | null> {
    const playlists = await this.rows<PlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}
         FROM playlists p
         ${PLAYLIST_JOINS}
        WHERE p.id = $1
        LIMIT 1`,
      [id],
    );

    const playlist = playlists[0];
    if (!playlist) return null;

    const songs = await this.rows<SongRecord>(
      `SELECT ${SONG_SELECT}
         FROM playlist_songs playlist_item
         JOIN songs s ON s.id = playlist_item.song_id
         ${SONG_JOINS}
        WHERE playlist_item.playlist_id = $1
        ORDER BY playlist_item.position ASC`,
      [id],
    );

    return { playlist, songs };
  }

  /* ------------------------------ favoritos ------------------------------ */

  async listFavoriteSongs(params: UserPageParams): Promise<PageResult<SongRecord>> {
    const items = await this.rows<SongRecord>(
      `SELECT ${SONG_SELECT}
         FROM songs s
         ${SONG_JOINS}
         JOIN user_favorites favorite ON favorite.song_id = s.id
        WHERE favorite.user_id = $1
        ORDER BY favorite.created_at DESC, s.id ASC
        LIMIT $2 OFFSET $3`,
      [params.userId, params.limit, params.offset],
    );

    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM user_favorites favorite
         JOIN songs s ON s.id = favorite.song_id
        WHERE favorite.user_id = $1`,
      [params.userId],
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async listFavoriteSongIds(userId: string): Promise<string[]> {
    const rows = await this.rows<{ song_id: string }>(
      `SELECT favorite.song_id
         FROM user_favorites favorite
        WHERE favorite.user_id = $1
        ORDER BY favorite.song_id ASC`,
      [userId],
    );
    return rows.map((row) => row.song_id);
  }

  async listFavoriteAlbums(
    params: UserPageParams,
  ): Promise<PageResult<AlbumRecord>> {
    const items = await this.rows<AlbumRecord>(
      `SELECT ${ALBUM_SELECT}
         FROM albums a
         ${ALBUM_ARTIST_JOIN}
         JOIN user_favorite_albums favorite ON favorite.album_id = a.id
         LEFT JOIN songs s ON s.album_id = a.id
        WHERE favorite.user_id = $1
        GROUP BY a.id, a_artist.id, favorite.created_at
        ORDER BY favorite.created_at DESC, a.id ASC
        LIMIT $2 OFFSET $3`,
      [params.userId, params.limit, params.offset],
    );

    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM user_favorite_albums favorite
        WHERE favorite.user_id = $1`,
      [params.userId],
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async listFavoriteAlbumIds(userId: string): Promise<string[]> {
    const rows = await this.rows<{ album_id: string }>(
      `SELECT favorite.album_id
         FROM user_favorite_albums favorite
        WHERE favorite.user_id = $1
        ORDER BY favorite.album_id ASC`,
      [userId],
    );
    return rows.map((row) => row.album_id);
  }

  async listFavoritePlaylists(
    params: UserPageParams,
  ): Promise<PageResult<PlaylistRecord>> {
    const items = await this.rows<PlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}
         FROM playlists p
         ${PLAYLIST_JOINS}
         JOIN user_favorite_playlists favorite ON favorite.playlist_id = p.id
        WHERE favorite.user_id = $1
        ORDER BY favorite.created_at DESC, p.id ASC
        LIMIT $2 OFFSET $3`,
      [params.userId, params.limit, params.offset],
    );

    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM user_favorite_playlists favorite
        WHERE favorite.user_id = $1`,
      [params.userId],
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  async listFavoritePlaylistIds(userId: string): Promise<string[]> {
    const rows = await this.rows<{ playlist_id: string }>(
      `SELECT favorite.playlist_id
         FROM user_favorite_playlists favorite
        WHERE favorite.user_id = $1
        ORDER BY favorite.playlist_id ASC`,
      [userId],
    );
    return rows.map((row) => row.playlist_id);
  }

  async getLibraryIds(userId: string): Promise<{
    song_ids: string[];
    album_ids: string[];
    playlist_ids: string[];
  }> {
    // Una sola query: los 3 sets de likes ya ordenados.
    const rows = await this.rows<{
      song_ids: string[];
      album_ids: string[];
      playlist_ids: string[];
    }>(
      `SELECT
         COALESCE((
           SELECT json_agg(favorite.song_id ORDER BY favorite.song_id)
             FROM user_favorites favorite
            WHERE favorite.user_id = $1
         ), '[]'::json) AS song_ids,
         COALESCE((
           SELECT json_agg(favorite.album_id ORDER BY favorite.album_id)
             FROM user_favorite_albums favorite
            WHERE favorite.user_id = $1
         ), '[]'::json) AS album_ids,
         COALESCE((
           SELECT json_agg(favorite.playlist_id ORDER BY favorite.playlist_id)
             FROM user_favorite_playlists favorite
            WHERE favorite.user_id = $1
         ), '[]'::json) AS playlist_ids`,
      [userId],
    );

    const row = rows[0];
    return {
      song_ids: row?.song_ids ?? [],
      album_ids: row?.album_ids ?? [],
      playlist_ids: row?.playlist_ids ?? [],
    };
  }

  /* --------------------------- mis playlists ----------------------------- */

  async listMyPlaylists(userId: string): Promise<MyPlaylistRecord[]> {
    return await this.rows<MyPlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}, ${PLAYLIST_SONG_IDS}
         FROM playlists p
         ${PLAYLIST_JOINS}
        WHERE p.owner_id = $1
        ORDER BY p.created_at DESC, p.id ASC`,
      [userId],
    );
  }

  async listMyPlaylistsPage(
    params: UserPageParams,
  ): Promise<PageResult<MyPlaylistRecord>> {
    const items = await this.rows<MyPlaylistRecord>(
      `SELECT ${PLAYLIST_SELECT}, ${PLAYLIST_SONG_IDS}
         FROM playlists p
         ${PLAYLIST_JOINS}
        WHERE p.owner_id = $1
        ORDER BY p.created_at DESC, p.id ASC
        LIMIT $2 OFFSET $3`,
      [params.userId, params.limit, params.offset],
    );

    const countRows = await this.rows<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM playlists p
        WHERE p.owner_id = $1`,
      [params.userId],
    );

    return { items, total: countRows[0]?.total ?? 0 };
  }

  /* --------------------------- recientes --------------------------------- */

  async listRecentlyPlayed(
    params: UserPageParams,
  ): Promise<PageResult<RecentlyPlayedRecord>> {
    const totalRows = await this.rows<{ total: number }>(
      `SELECT count(DISTINCT listen.song_id)::int AS total
         FROM listens listen
        WHERE listen.user_id = $1`,
      [params.userId],
    );

    // `page` = una fila por canción con su último play (orden del historial);
    // el count por canción se resuelve en la misma query.
    const items = await this.rows<RecentlyPlayedRecord>(
      `WITH page AS (
         SELECT listen.song_id, max(listen.played_at) AS played_at
           FROM listens listen
          WHERE listen.user_id = $1
          GROUP BY listen.song_id
          ORDER BY played_at DESC, listen.song_id ASC
          LIMIT $2 OFFSET $3
       )
       SELECT ${SONG_SELECT},
              (SELECT count(*)::int
                 FROM listens user_listen
                WHERE user_listen.user_id = $1
                  AND user_listen.song_id = s.id) AS user_play_count
         FROM page
         JOIN songs s ON s.id = page.song_id
         ${SONG_JOINS}
        ORDER BY page.played_at DESC, s.id ASC`,
      [params.userId, params.limit, params.offset],
    );

    return { items, total: totalRows[0]?.total ?? 0 };
  }
}
