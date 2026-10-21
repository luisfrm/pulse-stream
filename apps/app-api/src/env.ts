/**
 * Bindings/vars del Worker.
 *
 * Los secrets se declaran opcionales a nivel de tipo porque en `wrangler dev`
 * llegan desde `.dev.vars` y en producción desde `wrangler secret put`.
 * `config.ts` valida lo que cada request necesita.
 */
export type EnvironmentName = "local" | "dev" | "prod";

/** Subconjunto estructural del binding Hyperdrive de Cloudflare. */
export interface HyperdriveBinding {
  connectionString: string;
}

export interface Env {
  // Vars públicas (`wrangler.jsonc`).
  ENV?: string;
  APP_URL?: string;
  COOKIE_DOMAIN?: string;
  CORS_ORIGINS?: string;
  R2_PUBLIC_BASE_URL?: string;

  // Secrets.
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;

  // DB: en producción manda Hyperdrive; en local/tests cae a DATABASE_URL.
  DATABASE_URL?: string;
  HYPERDRIVE?: HyperdriveBinding;
}
