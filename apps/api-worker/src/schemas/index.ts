/**
 * Barrel de DTOs + lista de componentes OpenAPI.
 *
 * `openApiComponents` es la fuente única para registrar `components.schemas`:
 * el orden es el mismo que el del OpenAPI del backend Python, así un diff de
 * `generated.ts` queda legible.
 */

import type { z } from "@hono/zod-openapi";

import { AlbumCreateSchema, AlbumReadSchema, AlbumUpdateSchema } from "./albums";
import { AlbumDetailSchema } from "./album-detail";
import { ArtistCreateSchema, ArtistReadSchema, ArtistUpdateSchema } from "./artists";
import {
  ErrorModelSchema,
  HTTPValidationErrorSchema,
  ValidationErrorSchema,
} from "./errors";
import { SongGenreEnum } from "./genres";
import {
  ListenCreateSchema,
  ListenReadSchema,
  RecentlyPlayedSongSchema,
} from "./listens";
import {
  MyPlaylistReadSchema,
  PlaylistAddSongSchema,
  PlaylistCreateSchema,
  PlaylistDetailSchema,
  PlaylistKindEnum,
  PlaylistReadSchema,
  PlaylistSystemCreateSchema,
  PlaylistSystemQueryEnum,
  PlaylistUpdateSchema,
} from "./playlists";
import {
  PageAlbumReadSchema,
  PageArtistReadSchema,
  PageMyPlaylistReadSchema,
  PagePlaylistReadSchema,
  PageRecentlyPlayedSongSchema,
  PageSongReadSchema,
} from "./pages";
import {
  SongCreateSchema,
  SongReadSchema,
  SongUpdateSchema,
  SongWithPlaysSchema,
} from "./songs";
import {
  PresignRequestSchema,
  PresignResponseSchema,
  ZipImportIssueSchema,
  ZipImportResultSchema,
} from "./uploads";
import {
  UserCreateSchema,
  UserReadSchema,
  UserRoleEnum,
  UserRoleUpdateSchema,
  UserUpdateSchema,
} from "./users";

export * from "./albums";
export * from "./album-detail";
export * from "./artists";
export * from "./auth";
export * from "./common";
export * from "./errors";
export * from "./genres";
export * from "./listens";
export * from "./pages";
export * from "./playlists";
export * from "./songs";
export * from "./uploads";
export * from "./users";

/** [refId, schema] de todos los componentes a registrar en components.schemas. */
export const openApiComponents: Array<readonly [string, z.ZodType]> = [
  ["AlbumCreate", AlbumCreateSchema],
  ["AlbumDetail", AlbumDetailSchema],
  ["AlbumRead", AlbumReadSchema],
  ["AlbumUpdate", AlbumUpdateSchema],
  ["ArtistCreate", ArtistCreateSchema],
  ["ArtistRead", ArtistReadSchema],
  ["ArtistUpdate", ArtistUpdateSchema],
  ["ErrorModel", ErrorModelSchema],
  ["HTTPValidationError", HTTPValidationErrorSchema],
  ["ListenCreate", ListenCreateSchema],
  ["ListenRead", ListenReadSchema],
  ["MyPlaylistRead", MyPlaylistReadSchema],
  ["Page_AlbumRead_", PageAlbumReadSchema],
  ["Page_ArtistRead_", PageArtistReadSchema],
  ["Page_MyPlaylistRead_", PageMyPlaylistReadSchema],
  ["Page_PlaylistRead_", PagePlaylistReadSchema],
  ["Page_RecentlyPlayedSong_", PageRecentlyPlayedSongSchema],
  ["Page_SongRead_", PageSongReadSchema],
  ["PlaylistAddSong", PlaylistAddSongSchema],
  ["PlaylistCreate", PlaylistCreateSchema],
  ["PlaylistDetail", PlaylistDetailSchema],
  ["PlaylistKind", PlaylistKindEnum],
  ["PlaylistRead", PlaylistReadSchema],
  ["PlaylistSystemCreate", PlaylistSystemCreateSchema],
  ["PlaylistSystemQuery", PlaylistSystemQueryEnum],
  ["PlaylistUpdate", PlaylistUpdateSchema],
  ["PresignRequest", PresignRequestSchema],
  ["PresignResponse", PresignResponseSchema],
  ["RecentlyPlayedSong", RecentlyPlayedSongSchema],
  ["SongCreate", SongCreateSchema],
  ["SongGenre", SongGenreEnum],
  ["SongRead", SongReadSchema],
  ["SongUpdate", SongUpdateSchema],
  ["SongWithPlays", SongWithPlaysSchema],
  ["UserCreate", UserCreateSchema],
  ["UserRead", UserReadSchema],
  ["UserRole", UserRoleEnum],
  ["UserRoleUpdate", UserRoleUpdateSchema],
  ["UserUpdate", UserUpdateSchema],
  ["ValidationError", ValidationErrorSchema],
  ["ZipImportIssue", ZipImportIssueSchema],
  ["ZipImportResult", ZipImportResultSchema],
];
