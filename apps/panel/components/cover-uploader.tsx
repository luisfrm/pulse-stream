"use client";

import { COVER_CACHE_CONTROL, uploadToR2 } from "@pulse-stream/api-client";
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
 * CoverUploader del panel: mismo componente que la app, con el presign del
 * panel (en Fase 1 también contra Python) y el PUT a R2 del api-client.
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
