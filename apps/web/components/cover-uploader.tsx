"use client";

import {
  COVER_CACHE_CONTROL,
  uploadToR2,
} from "@pulse-stream/api-client";
import {
  CoverUploader as SharedCoverUploader,
  type CoverUploaderProps as SharedCoverUploaderProps,
} from "@pulse-stream/ui";

import { uploadsService } from "@/lib/services/uploads-service";

type CoverUploaderProps = Omit<
  SharedCoverUploaderProps,
  "presign" | "upload" | "cacheControl"
>;

/**
 * CoverUploader de la app: el componente vive en `@pulse-stream/ui` y acá solo
 * se le inyecta el presign de la app (`/uploads/presign-cover` de Hono) y el
 * PUT a R2 del api-client. El panel tiene su wrapper equivalente.
 */
export function CoverUploader(props: CoverUploaderProps) {
  return (
    <SharedCoverUploader
      {...props}
      presign={uploadsService.presignCover}
      upload={uploadToR2}
      cacheControl={COVER_CACHE_CONTROL}
    />
  );
}
