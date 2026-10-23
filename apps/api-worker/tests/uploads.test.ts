/**
 * Integración de `/uploads` (espejo de `apps/api/tests/test_uploads.py` +
 * las asserts de presign-cover de `test_covers.py`).
 *
 * Nunca se toca R2: el presign solo FIRMA (no hace red). Las credenciales son
 * falsas y explícitas para no depender de `.dev.vars`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { PresignResponse } from "@/schemas";
import {
  createClient,
  describeDb,
  readJson,
  registerAndLogin,
  resetDb,
  testBindings,
  type TestClient,
} from "./helpers";

/** Credenciales falsas: `enabled = true` sin llamadas a la red. */
const FAKE_R2 = {
  R2_ACCOUNT_ID: "0123456789abcdef",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "secret-example",
  R2_BUCKET_NAME: "pulse-bucket",
};

/** Las 4 credenciales vacías -> storage deshabilitado (503). */
const NO_R2 = {
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
};

const VALID = {
  filename: "cancion.mp3",
  content_type: "audio/mpeg",
  size: 1024 * 1024,
};

describeDb("uploads", () => {
  let client: TestClient;
  let unconfigured: TestClient;

  beforeEach(async () => {
    await resetDb();
    client = createClient(testBindings(FAKE_R2));
    unconfigured = createClient(testBindings(NO_R2));
  });

  it("presign requiere sesión (401)", async () => {
    const anonymous = createClient(testBindings(FAKE_R2));
    const response = await anonymous.postJson("/uploads/presign", VALID);

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ detail: "Unauthorized" });
  });

  it("content type inválido -> 400 mencionando el formato esperado", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/uploads/presign", {
      ...VALID,
      content_type: "video/mp4",
      filename: "clip.mp4",
    });

    expect(response.status).toBe(400);
    const body = await readJson<{ detail: string }>(response);
    expect(body.detail).toContain("audio/mpeg");
    expect(body.detail).toContain("video/mp4");
  });

  it("archivo demasiado grande -> 400 con 'tamaño máximo' y el tope real", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/uploads/presign", {
      ...VALID,
      size: 200 * 1024 * 1024,
    });

    expect(response.status).toBe(400);
    const detail = (await readJson<{ detail: string }>(response)).detail;
    expect(detail).toContain("tamaño máximo");
    // 50 MB por defecto (R2_MAX_UPLOAD_BYTES), no los 200 MB pedidos.
    expect(detail).toContain("50 MB");
  });

  it("presign de audio firma songs/{uuid}.mp3", async () => {
    // Un usuario NORMAL puede firmar (solo se exige sesión, no admin).
    await registerAndLogin(client);

    const response = await client.postJson("/uploads/presign", VALID);
    expect(response.status, await response.clone().text()).toBe(200);

    const data = await readJson<PresignResponse>(response);
    expect(data.object_key).toMatch(
      /^songs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/,
    );
    expect(data.content_type).toBe("audio/mpeg");
    expect(data.expires_in).toBe(600);

    const url = new URL(data.url);
    expect(url.hostname).toBe("0123456789abcdef.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/pulse-bucket/${data.object_key}`);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain("AKIDEXAMPLE");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    // El audio no firma Cache-Control (solo content-type + host).
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host",
    );
  });

  it("AAC (audio/aac) y la variante DLNA firman .aac", async () => {
    await registerAndLogin(client);

    for (const contentType of ["audio/aac", "audio/vnd.dlna.adts"]) {
      const response = await client.postJson("/uploads/presign", {
        filename: "tema.aac",
        content_type: contentType,
        size: 1024 * 1024,
      });
      expect(response.status).toBe(200);
      const data = await readJson<PresignResponse>(response);
      expect(data.object_key.endsWith(".aac")).toBe(true);
      expect(data.content_type).toBe(contentType);
    }
  });

  it("sin R2 configurado -> 503 con 'R2' en el detail", async () => {
    await registerAndLogin(unconfigured);

    const response = await unconfigured.postJson("/uploads/presign", VALID);
    expect(response.status).toBe(503);
    expect((await readJson<{ detail: string }>(response)).detail).toContain("R2");
  });

  it("cover: jpg/png -> 400 pidiendo WebP", async () => {
    await registerAndLogin(client);

    for (const [filename, contentType] of [
      ["cover.jpg", "image/jpeg"],
      ["cover.png", "image/png"],
    ] as const) {
      const response = await client.postJson("/uploads/presign-cover", {
        filename,
        content_type: contentType,
        size: 1024 * 50,
      });
      expect(response.status).toBe(400);
      const body = await readJson<{ detail: string }>(response);
      expect(body.detail).toContain("WebP");
      expect(body.detail).toContain(contentType);
    }
  });

  it("cover de más de 256 KB -> 400 con '256 KB'", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/uploads/presign-cover", {
      filename: "cover.webp",
      content_type: "image/webp",
      size: 256 * 1024 + 1,
    });

    expect(response.status).toBe(400);
    expect((await readJson<{ detail: string }>(response)).detail).toContain(
      "256 KB",
    );
  });

  it("cover WebP firma covers/{uuid}.webp con Cache-Control firmado", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/uploads/presign-cover", {
      filename: "cover.webp",
      content_type: "image/webp",
      size: 256 * 1024,
    });
    expect(response.status, await response.clone().text()).toBe(200);

    const data = await readJson<PresignResponse>(response);
    expect(data.object_key).toMatch(/^covers\/[0-9a-f-]{36}\.webp$/);

    const url = new URL(data.url);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "cache-control;content-type;host",
    );
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(data.expires_in).toBe(600);

    // Sin R2 no hay URL que firmar.
    const offline = createClient(testBindings(NO_R2));
    await registerAndLogin(offline);
    expect(
      (
        await offline.postJson("/uploads/presign-cover", {
          filename: "cover.webp",
          content_type: "image/webp",
          size: 1024,
        })
      ).status,
    ).toBe(503);
  });

  it("body inválido -> 422 (size negativo)", async () => {
    await registerAndLogin(client);

    const response = await client.postJson("/uploads/presign", {
      ...VALID,
      size: -1,
    });
    expect(response.status).toBe(422);
  });

  it("rate limit: 10/minuto por bucket (audio), 429 en la 11ª", async () => {
    // Rate limiting HABILITADO solo para este test (en prod nunca se apaga).
    const limited = createClient(
      testBindings({ ...FAKE_R2, RATE_LIMIT_DISABLED: "false" }),
    );
    await registerAndLogin(limited);

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect(
        (await limited.postJson("/uploads/presign", VALID)).status,
        `request ${attempt}`,
      ).toBe(200);
    }

    const blocked = await limited.postJson("/uploads/presign", VALID);
    expect(blocked.status).toBe(429);
    expect((await readJson<{ detail: string }>(blocked)).detail).toContain(
      "Demasiados intentos",
    );

    // Bucket separado: los covers siguen disponibles.
    expect(
      (
        await limited.postJson("/uploads/presign-cover", {
          filename: "cover.webp",
          content_type: "image/webp",
          size: 1024,
        })
      ).status,
    ).toBe(200);
  });
});
