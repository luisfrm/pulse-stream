import type { components } from "@pulse-stream/api-types";

// Tipos generados desde el OpenAPI de apps/api (AGENTS.md: nunca a mano).
export type User = components["schemas"]["UserRead"];
export type Artist = components["schemas"]["ArtistRead"];
export type Song = components["schemas"]["SongRead"];
export type PresignResponse = components["schemas"]["PresignResponse"];
export type SongGenre = components["schemas"]["SongGenre"];
export type Playlist = components["schemas"]["PlaylistRead"];
export type PlaylistDetail = components["schemas"]["PlaylistDetail"];

/** Respuesta paginada del backend (offset/limit). */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
