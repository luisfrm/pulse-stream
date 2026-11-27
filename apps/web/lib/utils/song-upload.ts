import { songsService, type CreateSongPayload } from "@/lib/services/songs-service";
import type { Song } from "@/lib/services/types";
import {
  uploadContentType,
  uploadsService,
  uploadToR2,
} from "@/lib/services/uploads-service";

export interface UploadAndCreateSongInput {
  title: string;
  artistId?: string;
  artistName?: string;
  albumId: string;
  genres: string[];
  lyrics?: string;
  collaboratorIds?: string[];
  file: File;
}

/**
 * Validates an internal panel return path to prevent open redirects.
 */
export function safePanelReturnPath(
  returnTo?: string | null,
  fallback = "/panel/songs"
): string {
  if (!returnTo) return fallback;
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith("/panel/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  return trimmed;
}

/**
 * Returns true when the return path points to a panel album detail page.
 */
export function isAlbumReturnPath(path: string): boolean {
  return path.startsWith("/panel/albums/");
}

/**
 * Presigns an audio file, uploads it directly to R2, and creates the song record.
 */
export async function uploadAndCreateSong(
  input: UploadAndCreateSongInput
): Promise<Song> {
  const contentType = uploadContentType(input.file);
  const presign = await uploadsService.presignUpload(
    input.file.name,
    contentType,
    input.file.size
  );
  await uploadToR2(presign.url, input.file);

  const payload: CreateSongPayload = {
    title: input.title.trim(),
    ...(input.artistId ? { artist_id: input.artistId } : {}),
    ...(input.artistName ? { artist_name: input.artistName.trim() } : {}),
    album_id: input.albumId,
    genres: input.genres,
    lyrics: input.lyrics?.trim() || undefined,
    object_key: presign.object_key,
    ...(input.collaboratorIds && input.collaboratorIds.length > 0
      ? { collaborator_ids: input.collaboratorIds }
      : {}),
  };

  return songsService.createSong(payload);
}
