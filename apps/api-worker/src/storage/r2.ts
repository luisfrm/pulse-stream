/**
 * Storage S3-compatible de Cloudflare R2 sobre `aws4fetch` (espejo de
 * `R2Storage` de `features/uploads/service.py`, que usa boto3).
 *
 * Dos operaciones, las únicas que necesita la API:
 *   - `presignPut`: URL firmada para que el NAVEGADOR suba el archivo directo a
 *     R2 (el audio nunca pasa por el Worker). El `Content-Type` y el
 *     `Cache-Control` de los covers viajan en la firma: el cliente DEBE
 *     reenviarlos como headers en el PUT o R2 rechaza con 403.
 *   - `putObject`: PUT server-side (import por ZIP de álbumes) con las mismas
 *     credenciales.
 *
 * La interfaz permite inyectar un storage falso en los tests: nunca se llama a
 * R2 real desde la suite.
 */

import { AwsClient } from "aws4fetch";

import type { AppConfig } from "@/env";
import { r2Enabled, r2Endpoint } from "@/env";
import { R2NotConfiguredError } from "@/lib/errors";
import { PRESIGN_EXPIRES_SECONDS } from "@/lib/upload-rules";

export interface R2Storage {
  readonly enabled: boolean;
  /** URL firmada (SigV4 en query) para un PUT directo del cliente. */
  presignPut(
    key: string,
    contentType: string,
    cacheControl?: string,
  ): Promise<string>;
  /** PUT firmado server-side con el cuerpo del archivo. */
  putObject(
    key: string,
    data: Uint8Array,
    contentType: string,
  ): Promise<void>;
}

/** `https://{endpoint}/{bucket}/{key}` con cada segmento escapado. */
function objectUrl(config: AppConfig, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${r2Endpoint(config)}/${config.r2.bucketName}/${encodedKey}`;
}

/**
 * Storage real, o uno deshabilitado cuando falta alguna credencial.
 *
 * El deshabilitado lanza `R2NotConfiguredError` si alguien lo llama igual: los
 * services validan `enabled` antes (mismo orden que Python), pero un endpoint
 * nuevo que se olvide del chequeo no debe romper con un 500 genérico.
 */
export function createR2Storage(config: AppConfig): R2Storage {
  if (!r2Enabled(config)) {
    return {
      enabled: false,
      presignPut: () => Promise.reject(new R2NotConfiguredError()),
      putObject: () => Promise.reject(new R2NotConfiguredError()),
    };
  }

  const client = new AwsClient({
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    service: "s3",
    // R2 ignora la región pero exige que esté en el scope de la firma.
    region: "auto",
  });

  return {
    enabled: true,

    async presignPut(key, contentType, cacheControl) {
      const url = new URL(objectUrl(config, key));
      // `aws4fetch` usa 86400 por default: el valor debe existir ANTES de
      // firmar (la firma incluye la query completa).
      url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRES_SECONDS));

      const headers: Record<string, string> = {
        "content-type": contentType,
      };
      if (cacheControl !== undefined) {
        headers["cache-control"] = cacheControl;
      }

      const signed = await client.sign(url.toString(), {
        method: "PUT",
        headers,
        // `signQuery` mueve las credenciales a la query; `allHeaders` mete
        // content-type/cache-control en `X-Amz-SignedHeaders` (host incluido).
        aws: { signQuery: true, allHeaders: true },
      });
      return signed.url.toString();
    },

    async putObject(key, data, contentType) {
      const response = await client.fetch(objectUrl(config, key), {
        method: "PUT",
        headers: { "content-type": contentType },
        body: data,
      });
      if (!response.ok) {
        throw new Error(`PUT a R2 falló con status ${response.status}`);
      }
    },
  };
}
