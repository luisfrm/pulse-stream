/**
 * Fragmentos SQL compartidos del catálogo.
 *
 * Reglas:
 * - Todo valor va parametrizado (`repository.ts`); acá solo hay identificadores
 *   y expresiones fijas.
 * - `created_at` se selecciona como JSON (`to_json(... AT TIME ZONE 'UTC')`)
 *   para preservar microsegundos y serializar ISO-8601 como Python.
 * - Los álbumes anidados en canciones llevan `song_count = 0` (contrato).
 */

/** Timestamp en UTC, sin offset (el mapper agrega la `Z`). */
export const utcTimestamp = (column: string): string =>
  `(${column} AT TIME ZONE 'UTC')`;

/** `ArtistRead` de una tabla `artists` con el alias dado. */
export const artistJson = (alias: string): string => `json_build_object(
      'id', ${alias}.id,
      'name', ${alias}.name,
      'image_url', ${alias}.image_url,
      'cover_key', ${alias}.cover_key,
      'created_at', ${utcTimestamp(`${alias}.created_at`)}
    )`;

/** `AlbumRead` anidado (sin cover_url: lo calcula el mapper). */
export const albumJson = (
  alias: string,
  artistAlias: string,
  songCount: string,
): string => `json_build_object(
      'id', ${alias}.id,
      'title', ${alias}.title,
      'cover_key', ${alias}.cover_key,
      'created_at', ${utcTimestamp(`${alias}.created_at`)},
      'song_count', ${songCount},
      'artist', ${artistJson(artistAlias)}
    )`;

/**
 * Colaboradores de la canción `s` como array JSON (vacío si no hay).
 * Orden por nombre para que la respuesta sea determinista (Python no fija
 * ORDER BY en la relación).
 */
export const collaboratorsJson = (songAlias: string): string => `COALESCE((
      SELECT json_agg(${artistJson("song_collaborator_artist")}
        ORDER BY song_collaborator_artist.name, song_collaborator_artist.id)
        FROM song_collaborators song_collaborator
        JOIN artists song_collaborator_artist
          ON song_collaborator_artist.id = song_collaborator.artist_id
       WHERE song_collaborator.song_id = ${songAlias}.id
    ), '[]'::json)`;

/** Columnas de `SongRead` (requiere `s` + `SONG_JOINS`). */
export const SONG_SELECT = `
    s.id,
    s.title,
    s.genres,
    s.lyrics,
    s.object_key,
    s.duration_seconds,
    s.play_count,
    to_json(${utcTimestamp("s.created_at")}) AS created_at,
    ${artistJson("song_artist")} AS artist,
    CASE
      WHEN song_album.id IS NULL THEN NULL
      ELSE ${albumJson("song_album", "album_artist", "0")}
    END AS album,
    ${collaboratorsJson("s")} AS collaborators`;

/** JOINs que necesita `SONG_SELECT` (artista principal + álbum con su artista). */
export const SONG_JOINS = `
    JOIN artists song_artist ON song_artist.id = s.artist_id
    LEFT JOIN albums song_album ON song_album.id = s.album_id
    LEFT JOIN artists album_artist ON album_artist.id = song_album.artist_id`;

/** Alias de los JOINs de filtros de `/songs` (los usa `repository.ts`). */
export const COLLABORATOR_JOIN =
  "JOIN song_collaborators filter_collaborator ON filter_collaborator.song_id = s.id";
export const PLAYLIST_JOIN =
  "JOIN playlist_songs filter_playlist ON filter_playlist.song_id = s.id";

/** Columnas de `ArtistRead` para `artists a`. */
export const ARTIST_SELECT = `
    a.id,
    a.name,
    a.image_url,
    a.cover_key,
    to_json(${utcTimestamp("a.created_at")}) AS created_at`;

/** Columnas de `AlbumRead` con `song_count` (requiere `a` + `a_artist`). */
export const ALBUM_SELECT = `
    a.id,
    a.title,
    a.cover_key,
    to_json(${utcTimestamp("a.created_at")}) AS created_at,
    count(s.id)::int AS song_count,
    ${artistJson("a_artist")} AS artist`;

/** JOIN del artista de un álbum (`a_artist`). */
export const ALBUM_ARTIST_JOIN =
  "JOIN artists a_artist ON a_artist.id = a.artist_id";

/** Columnas de `PlaylistRead` (requiere `p` + `PLAYLIST_JOINS`). */
export const PLAYLIST_SELECT = `
    p.id,
    p.kind,
    p.name,
    p.description,
    p.is_public,
    p.cover_key,
    p.query,
    p.owner_id,
    to_json(${utcTimestamp("p.created_at")}) AS created_at,
    playlist_owner.email AS owner_email,
    (SELECT count(*)::int
       FROM playlist_songs playlist_song
      WHERE playlist_song.playlist_id = p.id) AS song_count`;

/** JOIN del dueño de la playlist (`playlist_owner`). */
export const PLAYLIST_JOINS =
  "JOIN users playlist_owner ON playlist_owner.id = p.owner_id";

/**
 * `song_ids` de la playlist en orden de `position` (para `MyPlaylistRead`).
 * Requiere `p`.
 */
export const PLAYLIST_SONG_IDS = `COALESCE((
      SELECT json_agg(playlist_item.song_id ORDER BY playlist_item.position)
        FROM playlist_songs playlist_item
       WHERE playlist_item.playlist_id = p.id
    ), '[]'::json) AS song_ids`;
