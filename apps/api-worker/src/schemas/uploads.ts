/**
 * DTOs de uploads (espejo de `features/uploads/schemas.py`).
 */

import { z } from "@hono/zod-openapi";

import { IntSchema } from "./common";
import { SongReadSchema } from "./songs";

export const PresignRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    content_type: z.string(),
    size: IntSchema.min(0),
  })
  .openapi("PresignRequest");

export const PresignResponseSchema = z
  .object({
    url: z.string(),
    object_key: z.string(),
    content_type: z.string(),
    expires_in: IntSchema,
  })
  .openapi("PresignResponse");

/** Un archivo del ZIP que no se importó (saltado o fallido), con el motivo. */
export const ZipImportIssueSchema = z
  .object({
    name: z.string(),
    reason: z.string(),
  })
  .openapi("ZipImportIssue");

export const ZipImportResultSchema = z
  .object({
    imported: z.array(SongReadSchema).optional(),
    skipped: z.array(ZipImportIssueSchema).optional(),
    failed: z.array(ZipImportIssueSchema).optional(),
  })
  .openapi("ZipImportResult");

export type PresignRequest = z.infer<typeof PresignRequestSchema>;
export type PresignResponse = z.infer<typeof PresignResponseSchema>;
export type ZipImportIssue = z.infer<typeof ZipImportIssueSchema>;
export type ZipImportResult = z.infer<typeof ZipImportResultSchema>;
