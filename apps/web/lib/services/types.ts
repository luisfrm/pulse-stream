import type { components } from "@pulse-stream/api-types";

// Tipos generados desde el OpenAPI de apps/api (AGENTS.md: nunca a mano).
export type User = components["schemas"]["UserRead"];
export type Artist = components["schemas"]["ArtistRead"];
export type Song = components["schemas"]["SongRead"];
export type SongWithPlays = components["schemas"]["SongWithPlays"];
export type RecentlyPlayedSong = components["schemas"]["RecentlyPlayedSong"];
export type Album = components["schemas"]["AlbumRead"];
export type AlbumDetail = components["schemas"]["AlbumDetail"];
export type ZipImportResult = components["schemas"]["ZipImportResult"];
export type ZipImportIssue = components["schemas"]["ZipImportIssue"];
export type ListenRead = components["schemas"]["ListenRead"];
export type PresignResponse = components["schemas"]["PresignResponse"];
export type SongGenre = components["schemas"]["SongGenre"];
export type Playlist = components["schemas"]["PlaylistRead"];
export type PlaylistDetail = components["schemas"]["PlaylistDetail"];
/** Playlist del usuario (GET /me/playlists): `PlaylistRead` + `song_ids` por posición. */
export type MyPlaylist = components["schemas"]["MyPlaylistRead"];

/** Respuesta paginada del backend (offset/limit). */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
