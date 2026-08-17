import { ofetch } from "ofetch";

import { api } from "@/lib/api/client";
import type { PresignResponse } from "./types";

export const uploadsService = {
  /** Firma una URL de subida directa a R2 (5-10 min de validez). */
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
};

/**
 * Sube el archivo DIRECTO a R2 con la presigned URL.
 *
 * R2 es una API externa: se usa `ofetch` directo (sin la instancia `api`,
 * que enviaría cookies privadas y la baseURL interna).
 */
export async function uploadToR2(
  presignedUrl: string,
  file: File,
): Promise<void> {
  await ofetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "audio/mpeg" },
    body: file,
    retry: 0,
  });
}
