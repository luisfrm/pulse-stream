/**
 * Endpoints de `/albums` (espejo de `features/albums/router.py`).
 *
 *   GET    /albums                  -> listado público (Page<AlbumRead>, created_at desc)
 *   GET    /albums/{id}             -> AlbumDetail (álbum + canciones)
 *   POST   /albums                  -> solo admin (201)
 *   PATCH  /albums/{id}             -> solo admin
 *   DELETE /albums/{id}             -> solo admin (204; 400 si tiene canciones)
 *   POST   /albums/{id}/import-zip  -> solo admin: import masivo desde un ZIP
 *
 * PARIDAD DE CONTRATO: `responses` y `requestBody` son los del OpenAPI de
 * Python (éxito + 422; multipart con `$ref` al `Body_...`), para que
 * `pnpm gen:types:worker` no cambie `generated.ts`. Los 400/401/403/404 existen
 * en runtime pero no se documentan, igual que en FastAPI.
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";

import type { AppDeps } from "@/deps";
import { storageFor } from "@/deps";
import type { AppEnv } from "@/index";
import type { AppConfig } from "@/env";
import { pageQuerySchema, paginate } from "@/lib/pagination";
import { toAlbumDetailDto, toAlbumDto, toSongDto } from "@/lib/serialize";
import { IMPORT_ZIP_RATE_LIMIT } from "@/lib/upload-rules";
import { enforceRateLimit, requireAdmin } from "@/middleware/auth";
import {
  AlbumCreateSchema,
  AlbumDetailSchema,
  AlbumUpdateSchema,
  HTTPValidationErrorSchema,
  PageAlbumReadSchema,
  UuidSchema,
  ZipImportBodySchema,
  ZipImportResultSchema,
} from "@/schemas";
import {
  createAlbumRecord,
  deleteAlbumRecord,
  getAlbumDetail,
  listAlbumPage,
  updateAlbumRecord,
} from "@/services/albums";
import { assertZipSizeWithinLimit, importAlbumZip } from "@/services/zip-import";
import type { AlbumDetailData } from "@/services/albums";

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const listQuery = pageQuerySchema().extend({
  q: z.string().max(255).nullable().optional().openapi({
    description: "Búsqueda por título",
  }),
  artist_id: UuidSchema.nullable().optional().openapi({
    description: "Filtrar por artista",
  }),
});

const albumParams = z.object({ album_id: UuidSchema });

/** `AlbumDetail` desde el agregado del service (álbum + canciones). */
function toDetailDto(detail: AlbumDetailData, config: AppConfig) {
  return toAlbumDetailDto(
    detail.album,
    config,
    detail.songs.map((song) => toSongDto(song, config)),
  );
}

const listAlbumsRoute = createRoute({
  method: "get",
  path: "/albums",
  tags: ["albums"],
  summary: "List Albums",
  operationId: "list_albums_albums_get",
  request: { query: listQuery },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: PageAlbumReadSchema } },
    },
    422: validationError,
  },
});

const getAlbumRoute = createRoute({
  method: "get",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Get Album",
  operationId: "get_album_albums__album_id__get",
  request: { params: albumParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    422: validationError,
  },
});

const createAlbumRoute = createRoute({
  method: "post",
  path: "/albums",
  tags: ["albums"],
  summary: "Create Album",
  operationId: "create_album_albums_post",
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AlbumCreateSchema } },
    },
  },
  responses: {
    201: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    422: validationError,
  },
});

const updateAlbumRoute = createRoute({
  method: "patch",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Update Album",
  operationId: "update_album_albums__album_id__patch",
  middleware: [requireAdmin] as const,
  request: {
    params: albumParams,
    body: {
      required: true,
      content: { "application/json": { schema: AlbumUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    422: validationError,
  },
});

const deleteAlbumRoute = createRoute({
  method: "delete",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Delete Album",
  operationId: "delete_album_albums__album_id__delete",
  middleware: [requireAdmin] as const,
  request: { params: albumParams },
  responses: {
    204: { description: "Successful Response" },
    422: validationError,
  },
});

/**
 * Un body que no es `multipart/form-data` responde el 422 de FastAPI.
 *
 * El validador `form` de Hono corta con **415** cuando el content-type no es
 * multipart; FastAPI, en cambio, devuelve 422 (`file` requerido). El middleware
 * se registra ANTES del validador (orden de `route.middleware`).
 */
const requireMultipart: MiddlewareHandler<AppEnv> = async (c, next) => {
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    await next();
    return;
  }

  return c.json(
    {
      detail: [
        {
          type: "missing",
          loc: ["body", "file"],
          msg: "Field required",
          input: null,
        },
      ],
    },
    422,
  );
};

const importAlbumZipRoute = createRoute({
  method: "post",
  path: "/albums/{album_id}/import-zip",
  tags: ["albums"],
  summary: "Import Album Zip",
  operationId: "import_album_zip_albums__album_id__import_zip_post",
  description:
    "Importa un álbum completo desde un ZIP (admin only).\n\n" +
    "Cada archivo .mp3/.aac del ZIP se sube a R2 y se crea como canción del\n" +
    "álbum (mismo artista y cover del álbum). El título y la duración se leen\n" +
    "de los tags ID3 (fallback: nombre del archivo). Los archivos que no\n" +
    "cumplen los requisitos se reportan en la respuesta, sin abortar el resto.",
  middleware: [requireAdmin, requireMultipart] as const,
  request: {
    params: albumParams,
    body: {
      required: true,
      content: { "multipart/form-data": { schema: ZipImportBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: ZipImportResultSchema } },
    },
    422: validationError,
  },
});

export function registerAlbumRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  app.openapi(listAlbumsRoute, async (c) => {
    const config = c.get("config");
    const { offset, limit, q, artist_id } = c.req.valid("query");
    const page = await listAlbumPage(
      config,
      { search: q, artistId: artist_id },
      offset,
      limit,
    );
    return c.json(
      paginate(
        page.items.map((album) => toAlbumDto(album, config)),
        page.total,
        offset,
        limit,
      ),
      200,
    );
  });

  app.openapi(getAlbumRoute, async (c) => {
    const config = c.get("config");
    const detail = await getAlbumDetail(config, c.req.valid("param").album_id);
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(createAlbumRoute, async (c) => {
    const config = c.get("config");
    const detail = await createAlbumRecord(config, c.req.valid("json"));
    return c.json(toDetailDto(detail, config), 201);
  });

  app.openapi(updateAlbumRoute, async (c) => {
    const config = c.get("config");
    const detail = await updateAlbumRecord(
      config,
      c.req.valid("param").album_id,
      c.req.valid("json"),
    );
    return c.json(toDetailDto(detail, config), 200);
  });

  app.openapi(deleteAlbumRoute, async (c) => {
    const config = c.get("config");
    await deleteAlbumRecord(config, c.req.valid("param").album_id);
    return c.body(null, 204);
  });

  app.openapi(importAlbumZipRoute, async (c) => {
    const config = c.get("config");
    await enforceRateLimit(c, "import-zip", IMPORT_ZIP_RATE_LIMIT);

    // Corte temprano: si el `content-length` declarado ya supera el tope, no se
    // parsea el multipart (evita bufferear un body que se va a rechazar). El
    // tamaño real se vuelve a validar en el service (autoritativo).
    const declaredLength = Number(c.req.header("content-length") ?? "");
    if (Number.isFinite(declaredLength)) {
      assertZipSizeWithinLimit(config, declaredLength);
    }

    // El validador de `form` garantiza el `file` (422 de FastAPI si falta).
    const { file } = c.req.valid("form");
    // `new Uint8Array(buffer)` es una VISTA (cero copia) del ArrayBuffer del
    // `File`: el ZIP ya está materializado por el runtime y no se duplica.
    const zipData = new Uint8Array(await file.arrayBuffer());

    const result = await importAlbumZip(
      config,
      storageFor(deps, config),
      c.req.valid("param").album_id,
      zipData,
    );

    return c.json(
      {
        imported: result.imported.map((song) => toSongDto(song, config)),
        skipped: result.skipped,
        failed: result.failed,
      },
      200,
    );
  });
}
