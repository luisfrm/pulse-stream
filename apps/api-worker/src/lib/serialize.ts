/**
 * Serializadores: filas Drizzle -> DTO JSON idéntico al de Pydantic.
 *
 * Único lugar donde se construyen los DTOs de salida (nunca se devuelve una
 * fila de la DB tal cual). Replica detalles observables del backend Python:
 *   - fechas ISO-8601 con `Z` y microsegundos de 6 dígitos solo si no son 0;
 *   - `cover_url`/`stream_url` = dominio público de R2 + key (o null);
 *   - `role` legacy se normaliza a null;
 *   - `song_count` / `owner_email` son campos derivados, no columnas.
 */

import type { AppConfig } from "@/env";
import { r2PublicBaseUrl } from "@/env";
import type {
  AlbumRow,
  ArtistRow,
  ListenRow,
  PlaylistRow,
  SongRow,
  UserRow,
} from "@/db/schema";
import type {
  AlbumDetail,
  AlbumRead,
  ArtistRead,
  ListenRead,
  MyPlaylistRead,
  PlaylistDetail,
  PlaylistRead,
  SongGenre,
  SongRead,
  SongWithPlays,
  UserRead,
} from "@/schemas";
import { SongGenreEnum } from "@/schemas";

/**
 * `2026-10-22T12:34:56Z` con la misma regla que pydantic-core:
 * UTC en `Z`; microsegundos de 6 dígitos solo si no son 0.
 *
 * LÍMITE CONOCIDO: `Date` de JS solo guarda milisegundos, así que los
 * microsegundos 4..6 siempre salen en 0 (`.123Z` -> `.123000Z`). Postgres
 * puede devolver 6 dígitos, pero el driver los trunca al construir el `Date`:
 * es una pérdida de precisión aceptada (el contrato de formato se respeta y
 * el web compara/ordena, no muestra microsegundos).
 */
export function toPydanticDateTime(value: Date): string {
  const iso = value.toISOString(); // 2026-10-22T12:34:56.123Z
  const milliseconds = iso.slice(20, 23);
  const base = iso.slice(0, 19);
  return milliseconds === "000" ? `${base}Z` : `${base}.${milliseconds}000Z`;
}

/** `${base}/${key}` sin doble slash; null si falta base o key. */
export function publicUrl(
  base: string | undefined | null,
  key: string | null | undefined,
): string | null {
  if (!base || !key) return null;
  return `${base.replace(/\/+$/, "")}/${key}`;
}

function coverUrl(config: AppConfig, key: string | null): string | null {
  return publicUrl(r2PublicBaseUrl(config), key);
}

/** Géneros guardados en la columna JSON: se filtran los valores desconocidos. */
const SONG_GENRES = new Set<string>(SongGenreEnum.options);

function toGenres(values: readonly string[] | null): SongGenre[] {
  return (values ?? []).filter((value): value is SongGenre => SONG_GENRES.has(value));
}

// --- Usuarios ---------------------------------------------------------------

export function toUserDto(row: UserRow, config: AppConfig): UserRead {
  return {
    id: row.id,
    email: row.email,
    is_active: row.isActive,
    is_verified: row.isVerified,
    is_superuser: row.isSuperuser,
    // La columna es VARCHAR: cualquier valor distinto de "admin" (legacy
    // "user") se expone como null, igual que la semántica post-0003.
    role: row.role === "admin" ? "admin" : null,
    username: row.username ?? null,
    cover_key: row.coverKey ?? null,
    cover_url: coverUrl(config, row.coverKey),
    total_plays: row.totalPlays,
  };
}

// --- Artistas ---------------------------------------------------------------

export function toArtistDto(row: ArtistRow, config: AppConfig): ArtistRead {
  return {
    id: row.id,
    name: row.name,
    image_url: row.imageUrl ?? null,
    cover_key: row.coverKey ?? null,
    created_at: toPydanticDateTime(row.createdAt),
    cover_url: coverUrl(config, row.coverKey),
  };
}

// --- Álbumes ----------------------------------------------------------------

export interface AlbumInput extends AlbumRow {
  /** Relación eager-loaded (obligatoria para AlbumRead.artist). */
  artist: ArtistRow;
  /** COUNT calculado en la query (listados). */
  songCount?: number;
  /**
   * Detalle: las canciones ya cargadas. Acá solo se usa el largo (fallback de
   * `song_count`), así que el tipo mínimo es "algo con id" y no obliga a
   * levantar `SongRead` completo.
   */
  songs?: readonly { id: string }[];
}

export function toAlbumDto(row: AlbumInput, config: AppConfig): AlbumRead {
  return {
    id: row.id,
    title: row.title,
    artist: toArtistDto(row.artist, config),
    cover_key: row.coverKey ?? null,
    cover_url: coverUrl(config, row.coverKey),
    song_count: row.songCount ?? row.songs?.length ?? 0,
    created_at: toPydanticDateTime(row.createdAt),
  };
}

/**
 * `AlbumDetail` = `AlbumRead` + canciones.
 *
 * `song_count` sale de las canciones cargadas (`songs.length`), igual que el
 * `get_album` de Python (que setea `album.song_count = len(album.songs)`).
 */
export function toAlbumDetailDto(
  row: AlbumInput,
  config: AppConfig,
  songs: readonly SongRead[],
): AlbumDetail {
  return {
    ...toAlbumDto({ ...row, songs }, config),
    songs: [...songs],
  };
}

// --- Canciones --------------------------------------------------------------

export interface SongInput extends SongRow {
  /** Relación eager-loaded: sin esto `SongRead.artist` no se puede armar. */
  artist: ArtistRow;
  /**
   * Relación eager-loaded OBLIGATORIA (`null` explícito si no hay álbum): así
   * olvidarse de cargar `album` en la query es un error de compilación y no un
   * DTO con `cover_url` en null. El álbum trae su `artist` (AlbumRead.artist).
   */
  album: AlbumInput | null;
  collaborators?: readonly ArtistRow[];
}

export function toSongDto(row: SongInput, config: AppConfig): SongRead {
  return {
    id: row.id,
    title: row.title,
    artist: toArtistDto(row.artist, config),
    album: row.album ? toAlbumDto(row.album, config) : null,
    genres: toGenres(row.genres),
    lyrics: row.lyrics ?? null,
    object_key: row.objectKey,
    duration_seconds: row.durationSeconds ?? null,
    play_count: row.playCount ?? 0,
    created_at: toPydanticDateTime(row.createdAt),
    stream_url: publicUrl(r2PublicBaseUrl(config), row.objectKey),
    // El cover NO es propio: se hereda del álbum.
    cover_url: coverUrl(config, row.album?.coverKey ?? null),
    collaborators: (row.collaborators ?? []).map((artist) =>
      toArtistDto(artist, config),
    ),
  };
}

/** Canción + plays dentro de la ventana consultada (`GET /songs/popular`). */
export function toSongWithPlaysDto(
  row: SongInput,
  config: AppConfig,
  plays: number,
): SongWithPlays {
  return { ...toSongDto(row, config), play_count: plays };
}

// --- Playlists --------------------------------------------------------------

/**
 * Carga de `playlist_songs`: o las filas (para `song_ids`/`song_count`) o el
 * COUNT. Nunca ninguna de las dos: `toPlaylistDto` necesita una y el union
 * obliga a elegir en el call site.
 */
export type PlaylistLoad =
  | { items: readonly { songId: string }[]; songCount?: never }
  | { songCount: number; items?: never };

export type PlaylistInput = PlaylistRow &
  PlaylistLoad & {
    /** Email del dueño (join de `users`), `null` si no se cargó/no hay. */
    ownerEmail: string | null;
  };

/** Variante con las filas cargadas (lo que exige `song_ids`). */
export type PlaylistWithItems = PlaylistInput & {
  items: readonly { songId: string }[];
};

/** `true` si la carga trae el COUNT en vez de las filas. */
function hasSongCount(
  row: PlaylistLoad,
): row is { songCount: number; items?: never } {
  return typeof (row as { songCount?: number }).songCount === "number";
}

function playlistBase(row: PlaylistInput, config: AppConfig): PlaylistRead {
  const songCount = hasSongCount(row) ? row.songCount : (row.items ?? []).length;
  return {
    id: row.id,
    kind: row.kind === "system" ? "system" : "user",
    name: row.name,
    description: row.description ?? null,
    is_public: row.isPublic,
    cover_key: row.coverKey ?? null,
    cover_url: coverUrl(config, row.coverKey),
    song_count: songCount,
    query:
      row.query === "top_week" || row.query === "top_month" || row.query === "new"
        ? row.query
        : null,
    owner_email: row.ownerEmail,
    created_at: toPydanticDateTime(row.createdAt),
  };
}

export function toPlaylistDto(row: PlaylistInput, config: AppConfig): PlaylistRead {
  return playlistBase(row, config);
}

export function toPlaylistDetailDto(
  row: PlaylistInput,
  config: AppConfig,
  songs: readonly SongRead[],
): PlaylistDetail {
  return { ...playlistBase(row, config), songs: [...songs] };
}

export function toMyPlaylistDto(
  row: PlaylistWithItems,
  config: AppConfig,
): MyPlaylistRead {
  return {
    ...playlistBase(row, config),
    song_ids: row.items.map((item) => item.songId),
  };
}

// --- Reproducciones ---------------------------------------------------------

export function toListenDto(row: ListenRow): ListenRead {
  return {
    id: row.id,
    song_id: row.songId,
    played_at: toPydanticDateTime(row.playedAt),
  };
}
