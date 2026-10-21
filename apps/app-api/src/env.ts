/**
 * Bindings/vars del Worker.
 *
 * Los secrets se declaran opcionales a nivel de tipo porque en `wrangler dev`
 * llegan desde `.dev.vars` y en producción desde `wrangler secret put`.
 * `config.ts` valida lo que cada request necesita.
 */
export type EnvironmentName = "local" | "dev" | "prod";

export interface Env {
  // Vars públicas (`wrangler.jsonc`).
  ENV?: string;
  APP_URL?: string;
  COOKIE_DOMAIN?: string;
  CORS_ORIGINS?: string;
  R2_PUBLIC_BASE_URL?: string;

  // Secrets.
  AUTH_SECRET?: string;

  // R2 (presign de covers). Sin las 4 credenciales el endpoint responde 503.
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;

  // Neon HTTP (local y producción): siempre el mismo driver.
  DATABASE_URL?: string;
}
