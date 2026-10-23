/**
 * Tests del presign de R2 (sin red: solo se firma la URL).
 *
 * Lo que importa del contrato con el web: la URL debe traer los parámetros de
 * SigV4 en query, `X-Amz-Expires=600` y — clave — `Content-Type` (y
 * `Cache-Control` en covers) dentro de `X-Amz-SignedHeaders`, porque el
 * navegador los manda como headers en el PUT y R2 valida la firma contra ellos.
 */

import { describe, expect, it } from "vitest";

import { createConfig } from "@/env";
import { R2NotConfiguredError } from "@/lib/errors";
import { COVER_CACHE_CONTROL, PRESIGN_EXPIRES_SECONDS } from "@/lib/upload-rules";
import { createR2Storage } from "@/storage/r2";

const CREDENTIALS = {
  ENV: "local" as const,
  R2_ACCOUNT_ID: "0123456789abcdef",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "secret-example",
  R2_BUCKET_NAME: "pulse-bucket",
};

function config(overrides: Record<string, string> = {}) {
  return createConfig({ ...CREDENTIALS, ...overrides });
}

function query(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("createR2Storage", () => {
  it("sin las 4 credenciales queda deshabilitado y no firma", async () => {
    const storage = createR2Storage(config({ R2_SECRET_ACCESS_KEY: "" }));
    expect(storage.enabled).toBe(false);
    await expect(
      storage.presignPut("songs/x.mp3", "audio/mpeg"),
    ).rejects.toBeInstanceOf(R2NotConfiguredError);
  });

  it("presignPut de audio firma la URL con Content-Type en SignedHeaders", async () => {
    const storage = createR2Storage(config());
    const url = await storage.presignPut("songs/abc.mp3", "audio/mpeg");
    const params = query(url);

    expect(url.startsWith(
      "https://0123456789abcdef.r2.cloudflarestorage.com/pulse-bucket/songs/abc.mp3?",
    )).toBe(true);
    expect(params.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(params.get("X-Amz-Credential")).toMatch(
      /^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/,
    );
    expect(params.get("X-Amz-Date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(params.get("X-Amz-Expires")).toBe(String(PRESIGN_EXPIRES_SECONDS));
    // Sin Cache-Control: solo el content-type y el host.
    expect(params.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(params.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("presignPut de cover firma Cache-Control + Content-Type", async () => {
    const storage = createR2Storage(config());
    const url = await storage.presignPut(
      "covers/abc.webp",
      "image/webp",
      COVER_CACHE_CONTROL,
    );
    const params = query(url);

    expect(params.get("X-Amz-SignedHeaders")).toBe(
      "cache-control;content-type;host",
    );
    expect(params.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el content type y el cache-control entran en la firma", async () => {
    const storage = createR2Storage(config());
    const base = await storage.presignPut("covers/abc.webp", "image/webp");
    const withCache = await storage.presignPut(
      "covers/abc.webp",
      "image/webp",
      COVER_CACHE_CONTROL,
    );
    const otherType = await storage.presignPut(
      "covers/abc.webp",
      "audio/mpeg",
    );

    const signature = (url: string) => query(url).get("X-Amz-Signature");
    expect(signature(withCache)).not.toBe(signature(base));
    expect(signature(otherType)).not.toBe(signature(base));
  });

  it("escapa los segmentos de la key", async () => {
    const storage = createR2Storage(config());
    const url = await storage.presignPut("songs/a b.mp3", "audio/mpeg");
    expect(url).toContain("/pulse-bucket/songs/a%20b.mp3");
  });
});
