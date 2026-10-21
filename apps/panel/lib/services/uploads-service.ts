import { panelApi } from "@/lib/api/client";
import type { PresignResponse } from "./types";

export const uploadsService = {
  /** Firma una URL de subida directa a R2 para AUDIO (5-10 min de validez). */
  async presignUpload(
    filename: string,
    contentType: string,
    size: number,
  ): Promise<PresignResponse> {
    return await panelApi<PresignResponse>("/uploads/presign", {
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
    return await panelApi<PresignResponse>("/uploads/presign-cover", {
      method: "POST",
      body: { filename, content_type: contentType, size },
    });
  },
};
