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
  .openapi("ZipImportIssue").openapi({ description: "Un archivo del ZIP que no se importó (saltado o fallido), con el motivo." });

export const ZipImportResultSchema = z
  .object({
    imported: z.array(SongReadSchema).optional(),
    skipped: z.array(ZipImportIssueSchema).optional(),
    failed: z.array(ZipImportIssueSchema).optional(),
  })
  .openapi("ZipImportResult").openapi({ description: "Resultado del import por ZIP de un álbum completo." });

/**
 * Cuerpo multipart del import por ZIP (mismo nombre de componente que FastAPI).
 *
 * Se declara para que el OpenAPI tenga el mismo `requestBody` que Python
 * (`$ref` con `file` binario). El handler NO usa `c.req.valid("form")`: parsea
 * el `FormData` a mano para devolver el 422 con el body de FastAPI cuando falta
 * el archivo.
 */
export const ZipImportBodySchema = z
  .object({
    file: z.instanceof(File).openapi({
      type: "string",
      // FastAPI declara `contentMediaType` (no `format: binary`). El cast es
      // porque la metadata de zod-openapi tipa contra la unión OAS 3.0/3.1 y
      // `contentMediaType` solo existe en 3.1.
      contentMediaType: "application/octet-stream",
    } as unknown as { title: string }),
  })
  .openapi("Body_import_album_zip_albums__album_id__import_zip_post");

export type PresignRequest = z.infer<typeof PresignRequestSchema>;
export type PresignResponse = z.infer<typeof PresignResponseSchema>;
export type ZipImportIssue = z.infer<typeof ZipImportIssueSchema>;
export type ZipImportResult = z.infer<typeof ZipImportResultSchema>;
