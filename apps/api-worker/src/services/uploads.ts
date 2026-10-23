/**
 * Reglas de negocio de presign (espejo de `features/uploads/service.py`).
 *
 * Sin HTTP: recibe el `AppConfig` y el storage del request, valida el archivo y
 * firma la URL. El orden de los chequeos es el de Python y se nota en los
 * tests: primero el content type, después el tamaño y recién al final si R2
 * está configurado (así un archivo inválido da 400 y no 503).
 */

import type { AppConfig } from "@/env";
import { InvalidUploadError, R2NotConfiguredError } from "@/lib/errors";
import {
  AUDIO_EXTENSIONS,
  COVER_CACHE_CONTROL,
  COVER_EXTENSIONS,
  isAudioContentType,
  isCoverContentType,
  MAX_COVER_BYTES,
  PRESIGN_EXPIRES_SECONDS,
} from "@/lib/upload-rules";
import type { PresignRequest, PresignResponse } from "@/schemas";
import type { R2Storage } from "@/storage/r2";

/** MB legibles en los mensajes (Python: `size // (1024 * 1024)`). */
function megabytes(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}

/** `POST /uploads/presign`: URL firmada para AUDIO (mp3/aac). */
export async function presignAudioUpload(
  config: AppConfig,
  storage: R2Storage,
  payload: PresignRequest,
): Promise<PresignResponse> {
  if (!isAudioContentType(payload.content_type)) {
    throw new InvalidUploadError(
      `Tipo de archivo no permitido: ${payload.content_type}. ` +
        "Solo se aceptan archivos de audio MP3 o AAC " +
        "(audio/mpeg, audio/aac).",
    );
  }

  if (payload.size > config.r2.maxUploadBytes) {
    throw new InvalidUploadError(
      "El archivo supera el tamaño máximo de " +
        `${megabytes(config.r2.maxUploadBytes)} MB.`,
    );
  }

  if (!storage.enabled) throw new R2NotConfiguredError();

  const extension = AUDIO_EXTENSIONS[payload.content_type];
  const objectKey = `songs/${crypto.randomUUID()}${extension}`;
  // Sin Cache-Control: Python solo lo firma para covers.
  const url = await storage.presignPut(objectKey, payload.content_type);

  return {
    url,
    object_key: objectKey,
    content_type: payload.content_type,
    expires_in: PRESIGN_EXPIRES_SECONDS,
  };
}

/**
 * `POST /uploads/presign-cover`: solo WebP <= 256 KB.
 *
 * Firma `Cache-Control` inmutable: el front lo reenvía como header en el PUT.
 */
export async function presignCoverUpload(
  config: AppConfig,
  storage: R2Storage,
  payload: PresignRequest,
): Promise<PresignResponse> {
  if (!isCoverContentType(payload.content_type)) {
    throw new InvalidUploadError(
      `Tipo de archivo no permitido: ${payload.content_type}. ` +
        "Los covers se suben solo en WebP (image/webp).",
    );
  }

  if (payload.size > MAX_COVER_BYTES) {
    throw new InvalidUploadError(
      "El cover supera el tamaño máximo de 256 KB " +
        `(${payload.size} bytes).`,
    );
  }

  if (!storage.enabled) throw new R2NotConfiguredError();

  const extension = COVER_EXTENSIONS[payload.content_type];
  const objectKey = `covers/${crypto.randomUUID()}${extension}`;
  const url = await storage.presignPut(
    objectKey,
    payload.content_type,
    COVER_CACHE_CONTROL,
  );

  return {
    url,
    object_key: objectKey,
    content_type: payload.content_type,
    expires_in: PRESIGN_EXPIRES_SECONDS,
  };
}
