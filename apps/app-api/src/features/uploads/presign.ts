import { AwsClient } from "aws4fetch";

import type { R2Config } from "../../config";

/**
 * Presign PUT de covers a R2 (S3-compatible), sin `@aws-sdk`.
 *
 * Igual que Python (`uploads/service.py`):
 * - solo keys `covers/{uuid}.webp` (las arma el service);
 * - expira a los 600 s;
 * - firma `Content-Type` y `Cache-Control: public, max-age=31536000,
 *   immutable` en la query string: el front DEBE reenviar ambos headers en el
 *   PUT o R2 rechaza la firma (`uploadToR2` de `packages/api-client`).
 *
 * `CoverPresigner` es inyectable para que los tests no toquen la red.
 */

export const COVER_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const PRESIGN_EXPIRES_SECONDS = 600;
export const COVER_CONTENT_TYPE = "image/webp";
export const MAX_COVER_BYTES = 256 * 1024;

export interface CoverPresignInput {
  objectKey: string;
  contentType: string;
}

export interface CoverPresigner {
  /** URL firmada para un PUT directo del navegador a R2. */
  presignPut(input: CoverPresignInput): Promise<string>;
}

export function isR2Configured(config: R2Config): boolean {
  return Boolean(
    config.accountId &&
      config.accessKeyId &&
      config.secretAccessKey &&
      config.bucketName,
  );
}

/**
 * Firmer real (aws4fetch) o `null` si faltan credenciales.
 *
 * `allHeaders: true` es necesario porque aws4fetch excluye `content-type` de
 * los headers firmables por defecto; sin eso el PUT no verificaría el tipo.
 */
export function createCoverPresigner(config: R2Config): CoverPresigner | null {
  if (!isR2Configured(config)) return null;

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;

  return {
    async presignPut({ objectKey, contentType }) {
      const url = new URL(`${endpoint}/${config.bucketName}/${objectKey}`);
      // aws4fetch usa X-Amz-Expires (query string) como TTL del presign.
      url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRES_SECONDS));

      const signed = await client.sign(url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Cache-Control": COVER_CACHE_CONTROL,
        },
        aws: { signQuery: true, allHeaders: true },
      });

      return signed.url.toString();
    },
  };
}
