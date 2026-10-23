/**
 * Reglas de subida compartidas por `/uploads` y el import por ZIP.
 *
 * Los valores son EXACTAMENTE los de `features/uploads/service.py`: el front ya
 * depende de ellos (extensión del `object_key`, mensajes de error) y el presign
 * firma el mismo `Cache-Control` que `apps/web/lib/services/uploads-service.ts`
 * reenvía en el PUT a R2.
 *
 * Los content types se declaran como tuplas `as const` para que el mapeo a
 * extensión sea TOTAL (`Record<AudioContentType, string>`): así no hace falta
 * un fallback muerto después de validar.
 */

/** Content types de audio aceptados (Python: `ALLOWED_CONTENT_TYPES`). */
export const AUDIO_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/aac",
  "audio/x-hx-aac-adts",
  // Los navegadores/OS reportan .aac como ADTS (DLNA) — variante del mismo codec.
  "audio/vnd.dlna.adts",
] as const;

export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number];

/** Extensión del `object_key` según el content type del audio. */
export const AUDIO_EXTENSIONS: Readonly<Record<AudioContentType, string>> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/aac": ".aac",
  "audio/x-hx-aac-adts": ".aac",
  "audio/vnd.dlna.adts": ".aac",
};

/** Covers: solo WebP (se muestran en pills/cards; el PNG/JPG no entra). */
export const COVER_CONTENT_TYPES = ["image/webp"] as const;

export type CoverContentType = (typeof COVER_CONTENT_TYPES)[number];

/** Extensión del `object_key` según el content type del cover. */
export const COVER_EXTENSIONS: Readonly<Record<CoverContentType, string>> = {
  "image/webp": ".webp",
};

/** `true` si el content type es un audio aceptado (narrowing). */
export function isAudioContentType(
  value: string,
): value is AudioContentType {
  return (AUDIO_CONTENT_TYPES as readonly string[]).includes(value);
}

/** `true` si el content type es un cover aceptado (narrowing). */
export function isCoverContentType(
  value: string,
): value is CoverContentType {
  return (COVER_CONTENT_TYPES as readonly string[]).includes(value);
}

/** WebP de hasta 256 KB (un 800×800 q~75 pesa 60-100 KB). */
export const MAX_COVER_BYTES = 256 * 1024;

/**
 * Las keys llevan UUID → contenido inmutable: caché agresivo en R2 + CDN +
 * navegador. DUPLICADO a propósito en `apps/web` (el backend lo FIRMA en el
 * presign y el front lo REENVÍA como header en el PUT); si cambia acá, cambia
 * allá o R2 rechaza la firma.
 */
export const COVER_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Ventana de validez del presign (5-10 min para subir el archivo). */
export const PRESIGN_EXPIRES_SECONDS = 600;

/** Formatos aceptados por el import por ZIP (mismos codecs que el presign). */
export const IMPORT_EXTENSIONS: Readonly<Record<string, string>> = {
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
};

/** Rate limit del import por ZIP (hardcodeado igual que en `albums/router.py`). */
export const IMPORT_ZIP_RATE_LIMIT = "5/minute";
