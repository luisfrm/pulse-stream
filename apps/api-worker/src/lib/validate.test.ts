/**
 * Tests del hook de validación: el body 422 tiene que ser el de FastAPI.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";

import { createConfig, type Bindings } from "@/env";
import type { AppEnv } from "@/index";
import { pageQuerySchema } from "@/lib/pagination";
import { fastApiValidationHook } from "@/lib/validate";
import { ArtistCreateSchema } from "@/schemas/artists";
import { SongCreateSchema } from "@/schemas/songs";

const env: Bindings = {
  ENV: "local",
  AUTH_SECRET: "test-secret",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/pulse",
};

const app = new OpenAPIHono<AppEnv>({ defaultHook: fastApiValidationHook });
app.use("*", async (c, next) => {
  c.set("config", createConfig(c.env));
  await next();
});

const createSongRoute = createRoute({
  method: "post",
  path: "/songs",
  request: {
    body: {
      content: { "application/json": { schema: SongCreateSchema } },
    },
  },
  responses: { 201: { description: "Created" } },
});
app.openapi(createSongRoute, (c) => c.json({ ok: true }, 201));

const createArtistRoute = createRoute({
  method: "post",
  path: "/artists",
  request: {
    body: {
      content: { "application/json": { schema: ArtistCreateSchema } },
    },
  },
  responses: { 201: { description: "Created" } },
});
app.openapi(createArtistRoute, (c) => c.json({ ok: true }, 201));

const listArtistsRoute = createRoute({
  method: "get",
  path: "/artists",
  request: {
    query: pageQuerySchema(),
  },
  responses: { 200: { description: "OK" } },
});
app.openapi(listArtistsRoute, (c) => c.json({ ok: true }, 200));

/** Ruta de prueba para el mapeo de tipos (boolean/int/list + índice). */
const probeRoute = createRoute({
  method: "post",
  path: "/probe",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            enabled: z.boolean(),
            count: z.int(),
            tags: z.array(z.string()),
          }),
        },
      },
    },
  },
  responses: { 201: { description: "Created" } },
});
app.openapi(probeRoute, (c) => c.json({ ok: true }, 201));

interface ValidationBody {
  detail: Array<{
    type: string;
    loc: Array<string | number>;
    msg: string;
    input?: unknown;
  }>;
}

async function postJson(path: string, body: unknown) {
  const res = await app.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
  return { res, body: (await res.json()) as ValidationBody };
}

const baseSong = {
  title: "One More Time",
  album_id: "33333333-3333-4333-8333-333333333333",
  object_key: "audio/one-more-time.mp3",
};

describe("fastApiValidationHook", () => {
  it("deja pasar un body válido", async () => {
    const { res } = await postJson("/songs", { ...baseSong, artist_name: "Daft Punk" });
    expect(res.status).toBe(201);
  });

  it("422 con el valor de refine en loc del body", async () => {
    const { res, body } = await postJson("/songs", baseSong);
    expect(res.status).toBe(422);
    expect(body.detail[0]).toMatchObject({
      type: "value_error",
      loc: ["body"],
      msg: "Value error, Se requiere artist_id o artist_name",
    });
  });

  it("422 para un UUID inválido con loc del campo", async () => {
    const { res, body } = await postJson("/songs", {
      ...baseSong,
      artist_name: "Daft Punk",
      album_id: "no-es-uuid",
    });
    expect(res.status).toBe(422);
    expect(body.detail[0]).toMatchObject({
      type: "uuid_parsing",
      loc: ["body", "album_id"],
    });
  });

  it("422 con type/mensaje de string_too_short", async () => {
    const { res, body } = await postJson("/songs", {
      ...baseSong,
      artist_name: "Daft Punk",
      title: "",
    });
    expect(res.status).toBe(422);
    const issue = body.detail.find((item) => item.loc.join(".") === "body.title");
    expect(issue).toMatchObject({
      type: "string_too_short",
      msg: "String should have at least 1 character",
    });
  });

  it("422 reporta un campo faltante como missing/Field required", async () => {
    const { res, body } = await postJson("/artists", {});
    expect(res.status).toBe(422);
    expect(body.detail[0]).toMatchObject({
      type: "missing",
      loc: ["body", "name"],
      msg: "Field required",
    });
  });
});

describe("cover_key pattern", () => {
  it("acepta una key del presign", async () => {
    const { res } = await postJson("/artists", {
      name: "Daft Punk",
      cover_key: "covers/aaaaaaaa-1111-4111-8111-111111111111.webp",
    });
    expect(res.status).toBe(201);
  });

  it("rechaza keys arbitrarias (bypass por PATCH/POST directo)", async () => {
    const { res, body } = await postJson("/artists", {
      name: "Daft Punk",
      cover_key: "covers/foo.jpg",
    });
    expect(res.status).toBe(422);
    expect(body.detail[0]).toMatchObject({
      type: "string_pattern_mismatch",
      loc: ["body", "cover_key"],
    });
  });
});

describe("query params", () => {
  it("422 con loc query cuando limit está fuera de rango", async () => {
    const res = await app.request("/artists?limit=0", undefined, env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as ValidationBody;
    expect(body.detail[0]).toMatchObject({
      type: "greater_than_equal",
      loc: ["query", "limit"],
    });
  });

  it("coacciona offset/limit a int y aplica defaults", async () => {
    const res = await app.request("/artists?offset=10", undefined, env);
    expect(res.status).toBe(200);
  });
});

describe("mapeo de tipos de zod a Pydantic", () => {
  it("usa bool_type/list_type/int_type según el tipo esperado", async () => {
    const { res, body } = await postJson("/probe", {
      enabled: "si",
      count: "muchos",
      tags: "no-es-lista",
    });

    expect(res.status).toBe(422);
    const byField = new Map(
      body.detail.map((issue) => [issue.loc.slice(1).join("."), issue]),
    );

    expect(byField.get("enabled")).toMatchObject({
      type: "bool_type",
      msg: "Input should be a valid boolean",
    });
    expect(byField.get("count")).toMatchObject({
      type: "int_type",
      msg: "Input should be a valid integer",
    });
    expect(byField.get("tags")).toMatchObject({
      type: "list_type",
      msg: "Input should be a valid list",
    });
  });

  it("preserva el índice numérico del array en loc", async () => {
    const { res, body } = await postJson("/probe", {
      enabled: true,
      count: 1,
      tags: ["ok", 42],
    });

    expect(res.status).toBe(422);
    expect(body.detail[0]).toMatchObject({
      type: "string_type",
      loc: ["body", "tags", 1],
    });
    // Pydantic usa el número, no el string "1".
    expect(body.detail[0]?.loc[2]).toBe(1);
  });
});
