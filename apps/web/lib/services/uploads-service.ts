import { ofetch } from "ofetch";

import { api } from "@/lib/api/client";
import type { PresignResponse } from "./types";

export const uploadsService = {
  /** Firma una URL de subida directa a R2 para AUDIO (5-10 min de validez). */
  async presignUpload(
    filename: string,
    contentType: string,
    size: number,
  ): Promise<PresignResponse> {
    return await api<PresignResponse>("/uploads/presign", {
      method: "POST",
      body: { filename, content_type: contentType, size },
    });
  },

  /** Firma una URL de subida directa a R2 para COVERS (WebP <= 256 KB). */
  async presignCover(
    filename: string,
    contentType: string,
    size: number,
  ): Promise<PresignResponse> {
    return await api<PresignResponse>("/uploads/presign-cover", {
      method: "POST",
      body: { filename, content_type: contentType, size },
    });
  },
};

/**
 * Cache-Control firmado por el backend para covers (keys con UUID = inmutables).
 *
 * DUPLICADO del backend (`apps/api/app/features/uploads/service.py` →
 * `COVER_CACHE_CONTROL`): el backend lo FIRMA en el presign y este front lo
 * REENVÍA como header en el PUT a R2 (`uploadToR2`). Los valores DEBEN
 * coincidir o R2 rechaza la firma — si cambia allá, cambiar acá (y viceversa).
 */
export const COVER_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Sube el archivo DIRECTO a R2 con la presigned URL.
 *
 * R2 es una API externa: se usa `ofetch` directo (sin la instancia `api`,
 * que enviaría cookies privadas y la baseURL interna).
 *
 * `cacheControl` (solo covers): el PUT de presign-cover lo firma, así que el
 * header DEBE viajar igual que Content-Type o R2 rechaza la firma.
 */
export async function uploadToR2(
  presignedUrl: string,
  file: File,
  cacheControl?: string,
): Promise<void> {
  await ofetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "audio/mpeg",
      ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
    },
    body: file,
    retry: 0,
  });
}
