import { api } from "@/lib/api/client";
import type { PresignResponse } from "./types";

// Re-export del api-client: el PUT a R2 y el Cache-Control firmado son
// compartidos con el panel. Se mantiene acá por compat (tests y consumidores
// existentes importan estas dos piezas desde uploads-service).
export {
  COVER_CACHE_CONTROL,
  uploadToR2,
} from "@pulse-stream/api-client";

export const uploadsService = {
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
