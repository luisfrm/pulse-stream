/**
 * Endpoints de `/albums` (espejo de `features/albums/router.py`).
 *
 *   GET    /albums                  -> listado público (Page<AlbumRead>, created_at desc)
 *   GET    /albums/{id}             -> AlbumDetail (álbum + canciones)
 *   POST   /albums                  -> solo admin (201)
 *   PATCH  /albums/{id}             -> solo admin
 *   DELETE /albums/{id}             -> solo admin (204; 400 si tiene canciones)
 *   POST   /albums/{id}/import-zip  -> solo admin: import masivo desde un ZIP
 */

import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";

import type { AppDeps } from "@/deps";
import { storageFor } from "@/deps";
import type { AppConfig } from "@/env";
import type { AlbumDetailData } from "@/services/albums";
import type { AppEnv } from "@/index";
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

const validationError = {
  description: "Validation Error",
  content: { "application/json": { schema: HTTPValidationErrorSchema } },
};

const unauthorized = { description: "Missing token or inactive user." };
const forbidden = { description: "Requiere permisos de administrador" };
const notFound = { description: "Álbum o artista no encontrado" };

const listQuery = pageQuerySchema().extend({
  q: z.string().max(255).optional().openapi({
    description: "Búsqueda por título",
  }),
  artist_id: UuidSchema.optional().openapi({
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
  request: { params: albumParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: AlbumDetailSchema } },
    },
    404: notFound,
    422: validationError,
  },
});

const createAlbumRoute = createRoute({
  method: "post",
  path: "/albums",
  tags: ["albums"],
  summary: "Create Album",
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
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const updateAlbumRoute = createRoute({
  method: "patch",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Update Album",
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
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const deleteAlbumRoute = createRoute({
  method: "delete",
  path: "/albums/{album_id}",
  tags: ["albums"],
  summary: "Delete Album",
  middleware: [requireAdmin] as const,
  request: { params: albumParams },
  responses: {
    204: { description: "Successful Response" },
    400: { description: "El álbum tiene canciones" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

const importAlbumZipRoute = createRoute({
  method: "post",
  path: "/albums/{album_id}/import-zip",
  tags: ["albums"],
  summary: "Import Album Zip",
  description:
    "Importa un álbum completo desde un ZIP (admin only).\n\n" +
    "Cada archivo .mp3/.aac del ZIP se sube a R2 y se crea como canción del " +
    "álbum (mismo artista y cover del álbum). El título y la duración se leen " +
    "del nombre del archivo y del propio audio (los tags ID3 se ignoran). Los " +
    "archivos que no cumplen los requisitos se reportan en la respuesta, sin " +
    "abortar el resto.",
  middleware: [requireAdmin] as const,
  request: { params: albumParams },
  responses: {
    200: {
      description: "Successful Response",
      content: { "application/json": { schema: ZipImportResultSchema } },
    },
    400: { description: "ZIP inválido o demasiado grande" },
    401: unauthorized,
    403: forbidden,
    404: notFound,
    422: validationError,
  },
});

/**
 * Cuerpo `multipart/form-data` con el campo `file`.
 *
 * No se declara en el OpenAPI del route (Hono no valida multipart con zod): se
 * parsea acá y, si falta el archivo, se responde el 422 de FastAPI.
 */
async function readUploadFile(c: Context<AppEnv>): Promise<File | null> {
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) return null;

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return null;
  }

  const file = form.get("file");
  return file instanceof File ? file : null;
}

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

    const file = await readUploadFile(c);
    if (!file) {
      // Mismo 422 que FastAPI cuando falta el `UploadFile` del body.
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
    }

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
