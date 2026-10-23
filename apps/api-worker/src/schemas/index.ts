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
  ForgotPasswordSchema,
  LoginBodySchema,
  RequestVerifyTokenSchema,
  ResetPasswordSchema,
  VerifyTokenSchema,
} from "./auth";
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
  ZipImportBodySchema,
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
  // Bodies de fastapi-users / uploads: nombres EXACTOS que emite FastAPI.
  ["Body_auth_cookie_login_auth_login_post", LoginBodySchema],
  [
    "Body_import_album_zip_albums__album_id__import_zip_post",
    ZipImportBodySchema,
  ],
  ["Body_reset_forgot_password_auth_forgot_password_post", ForgotPasswordSchema],
  [
    "Body_reset_reset_password_auth_reset_password_post",
    ResetPasswordSchema,
  ],
  [
    "Body_verify_request_token_auth_request_verify_token_post",
    RequestVerifyTokenSchema,
  ],
  ["Body_verify_verify_auth_verify_post", VerifyTokenSchema],
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
