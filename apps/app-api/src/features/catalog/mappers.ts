import { publicObjectUrl } from "../../config";
import type {
  AlbumRecord,
  ArtistRecord,
  MyPlaylistRecord,
  PlaylistRecord,
  SongRecord,
} from "./repository";
import type {
  AlbumRead,
  ArtistRead,
  MyPlaylistRead,
  PlaylistDetail,
  PlaylistRead,
  RecentlyPlayedSong,
  SongRead,
} from "./schema";

/**
 * Mapeadores puros row → contrato (sin I/O). Reciben `R2_PUBLIC_BASE_URL` para
 * calcular `stream_url`/`cover_url`, igual que las propiedades de los modelos
 * de Python.
 */

/**
 * Normaliza una fecha de Postgres a ISO-8601 UTC con microsegundos.
 *
 * Las queries seleccionan `to_json(created_at AT TIME ZONE 'UTC')`, así que
 * el valor llega como `2026-08-19T12:34:56.789012` (timestamp sin offset) y
 * acá se le agrega la `Z`. La fracción se rellena a 6 dígitos porque Postgres
 * recorta los ceros finales (`...09.54825`) y Python serializa el `datetime`
 * con 6 (`...09.548250Z`).
 */
export function toIsoDate(value: string | Date): string {
  const iso = normalizeToUtcIso(value);
  const fractional = /^(.*T\d{2}:\d{2}:\d{2})\.(\d+)(Z)$/.exec(iso);
  if (!fractional) return iso;

  return `${fractional[1]}.${fractional[2]!.padEnd(6, "0")}${fractional[3]}`;
}

function normalizeToUtcIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();

  const normalized = value.includes("T") ? value : value.replace(" ", "T");

  if (normalized.endsWith("Z")) return normalized;

  // `+00`, `+0000`, `+00:00` → `Z` (Postgres/Date.toString).
  if (/\+00(?::?00)?$/.test(normalized)) {
    return normalized.replace(/\+00(?::?00)?$/, "Z");
  }

  // Timestamp naive (ya está en UTC por el `AT TIME ZONE 'UTC'`).
  if (!/[+-]\d{2}:?\d{2}$/.test(normalized)) return `${normalized}Z`;

  return normalized;
}

export function mapArtist(row: ArtistRecord, baseUrl: string): ArtistRead {
  return {
    id: row.id,
    name: row.name,
    image_url: row.image_url,
    cover_key: row.cover_key,
    created_at: toIsoDate(row.created_at),
    cover_url: publicObjectUrl(baseUrl, row.cover_key),
  };
}

export function mapAlbum(
  row: AlbumRecord,
  baseUrl: string,
  overrides: { song_count?: number } = {},
): AlbumRead {
  return {
    id: row.id,
    title: row.title,
    artist: mapArtist(row.artist, baseUrl),
    cover_key: row.cover_key,
    cover_url: publicObjectUrl(baseUrl, row.cover_key),
    song_count: overrides.song_count ?? row.song_count ?? 0,
    created_at: toIsoDate(row.created_at),
  };
}

export interface MapSongOptions {
  /**
   * Reemplaza `play_count` (ranking por ventana en `/songs/popular`).
   */
  play_count?: number;
  /**
   * Álbum anidado explícito. `GET /albums/{id}` lo usa para que cada
   * `song.album.song_count` sea el total real del álbum; en el resto de los
   * listados el contrato de Python devuelve 0.
   */
  album?: AlbumRead | null;
}

export function mapSong(
  row: SongRecord,
  baseUrl: string,
  options: MapSongOptions = {},
): SongRead {
  // En listas/detalle de canciones el álbum anidado SIEMPRE trae song_count 0
  // (así lo devuelve Python: el schema lee el default del modelo, no un count).
  const album =
    options.album !== undefined
      ? options.album
      : row.album
        ? mapAlbum({ ...row.album, song_count: 0 }, baseUrl)
        : null;

  return {
    id: row.id,
    title: row.title,
    artist: mapArtist(row.artist, baseUrl),
    album,
    genres: row.genres ?? [],
    lyrics: row.lyrics,
    object_key: row.object_key,
    duration_seconds: row.duration_seconds,
    play_count: options.play_count ?? row.play_count ?? 0,
    created_at: toIsoDate(row.created_at),
    stream_url: publicObjectUrl(baseUrl, row.object_key),
    cover_url: album ? publicObjectUrl(baseUrl, album.cover_key) : null,
    collaborators: (row.collaborators ?? []).map((collaborator) =>
      mapArtist(collaborator, baseUrl),
    ),
  };
}

export function mapPlaylist(
  row: PlaylistRecord,
  baseUrl: string,
): PlaylistRead {
  return {
    id: row.id,
    kind: row.kind === "system" ? "system" : "user",
    name: row.name,
    description: row.description,
    is_public: row.is_public,
    cover_key: row.cover_key,
    cover_url: publicObjectUrl(baseUrl, row.cover_key),
    song_count: row.song_count ?? 0,
    query: row.query,
    owner_email: row.owner_email,
    created_at: toIsoDate(row.created_at),
  };
}

export function mapPlaylistDetail(
  row: PlaylistRecord,
  songs: SongRecord[],
  baseUrl: string,
): PlaylistDetail {
  return {
    ...mapPlaylist(row, baseUrl),
    songs: songs.map((song) => mapSong(song, baseUrl)),
  };
}

export function mapMyPlaylist(
  row: MyPlaylistRecord,
  baseUrl: string,
): MyPlaylistRead {
  return {
    ...mapPlaylist(row, baseUrl),
    song_ids: row.song_ids ?? [],
  };
}

export function mapRecentlyPlayed(
  row: SongRecord & { user_play_count: number },
  baseUrl: string,
): RecentlyPlayedSong {
  return {
    ...mapSong(row, baseUrl),
    user_play_count: row.user_play_count ?? 0,
  };
}
