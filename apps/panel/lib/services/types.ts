import type { components } from "@pulse-stream/api-types";
import type { Page } from "@pulse-stream/shared";

// Tipos generados desde el OpenAPI de apps/api (AGENTS.md: nunca a mano).
export type User = components["schemas"]["UserRead"];
export type Artist = components["schemas"]["ArtistRead"];
export type Song = components["schemas"]["SongRead"];
export type Album = components["schemas"]["AlbumRead"];
export type AlbumDetail = components["schemas"]["AlbumDetail"];
export type ZipImportResult = components["schemas"]["ZipImportResult"];
export type ZipImportIssue = components["schemas"]["ZipImportIssue"];
export type PresignResponse = components["schemas"]["PresignResponse"];
export type SongGenre = components["schemas"]["SongGenre"];
export type Playlist = components["schemas"]["PlaylistRead"];
export type PlaylistDetail = components["schemas"]["PlaylistDetail"];

export type { Page };
