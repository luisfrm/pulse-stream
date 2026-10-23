/**
 * `Page<T>` por recurso.
 *
 * Solo se registra el nombre real de Pydantic (`Page_X_`, con guion bajo
 * final), que es el que genera `openapi-typescript` contra el backend Python.
 */

import { pageSchema } from "./common";
import { AlbumReadSchema } from "./albums";
import { ArtistReadSchema } from "./artists";
import { MyPlaylistReadSchema, PlaylistReadSchema } from "./playlists";
import { RecentlyPlayedSongSchema } from "./listens";
import { SongReadSchema } from "./songs";

export const PageArtistReadSchema = pageSchema(ArtistReadSchema, "ArtistRead");

export const PageAlbumReadSchema = pageSchema(AlbumReadSchema, "AlbumRead");

export const PageSongReadSchema = pageSchema(SongReadSchema, "SongRead");

export const PagePlaylistReadSchema = pageSchema(PlaylistReadSchema, "PlaylistRead");

export const PageMyPlaylistReadSchema = pageSchema(MyPlaylistReadSchema, "MyPlaylistRead");

export const PageRecentlyPlayedSongSchema = pageSchema(
  RecentlyPlayedSongSchema,
  "RecentlyPlayedSong",
);
