import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { requireUser } from "../../auth/guards";
import {
  BadRequestError,
  ErrorSchema,
  ServiceUnavailableError,
} from "../../lib/errors";
import type { AppBindings } from "../../types";
import {
  COVER_CONTENT_TYPE,
  MAX_COVER_BYTES,
  PRESIGN_EXPIRES_SECONDS,
} from "./presign";
import {
  PresignCoverRequestSchema,
  PresignCoverResponseSchema,
} from "./schema";

/**
 * Presign de covers (WebP <= 256 KB) con `Cache-Control` inmutable firmado.
 *
 * Las credenciales R2 llegan por `AppConfig.r2`; sin ellas el endpoint
 * responde 503 (nunca se filtra qué variable falta).
 */

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorSchema } },
  };
}

const presignCoverRoute = createRoute({
  method: "post",
  path: "/uploads/presign-cover",
  tags: ["uploads"],
  summary: "Firma un PUT de cover a R2",
  description:
    "Solo `image/webp` <= 256 KB. Devuelve una URL firmada (600 s) con `Cache-Control: public, max-age=31536000, immutable`.",
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: PresignCoverRequestSchema },
      },
    },
  },
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: "URL firmada",
      content: {
        "application/json": { schema: PresignCoverResponseSchema },
      },
    },
    400: errorResponse("Tipo o tamaño de archivo inválido"),
    401: errorResponse("Sin sesión válida"),
    503: errorResponse("R2 no configurado"),
  },
});

export function createUploadsRoutes(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>();

  app.openapi(presignCoverRoute, async (c) => {
    const payload = c.req.valid("json");
    await requireUser(c);

    // Mismo orden que Python: tipo -> tamaño -> storage configurado.
    if (payload.content_type !== COVER_CONTENT_TYPE) {
      throw new BadRequestError(
        `Tipo de archivo no permitido: ${payload.content_type}. ` +
          "Los covers se suben solo en WebP (image/webp).",
      );
    }
    if (payload.size > MAX_COVER_BYTES) {
      throw new BadRequestError(
        `El cover supera el tamaño máximo de 256 KB (${payload.size} bytes).`,
      );
    }

    const presigner = c.get("coverPresigner");
    if (!presigner) {
      throw new ServiceUnavailableError(
        "El storage (R2) no está configurado. Completá las env vars R2_* del Worker.",
      );
    }

    const objectKey = `covers/${crypto.randomUUID()}.webp`;
    const url = await presigner.presignPut({
      objectKey,
      contentType: payload.content_type,
    });

    return c.json(
      {
        url,
        object_key: objectKey,
        content_type: payload.content_type,
        expires_in: PRESIGN_EXPIRES_SECONDS,
      },
      200,
    );
  });

  return app;
}
