/**
 * Env del Worker + configuración normalizada por entorno.
 *
 * Espeja `apps/api/app/core/config.py`: `ENV` es autoritativo y en `local`
 * se fuerzan cookie de sesión host-only, SameSite=lax, Secure=false y CORS
 * restringido a loopback. El `config` se construye por request desde
 * `c.env` (no hay módulo global mutable).
 *
 * OJO: `createConfig` NO valida secretos (así `/health` responde sin envs).
 * Los módulos que los necesitan (auth, db) usan `requireAuthSecret` /
 * `requireDatabaseUrl`, que fallan con un error claro en español.
 */

export type Environment = "local" | "dev" | "prod";

const ENVIRONMENTS: readonly Environment[] = ["local", "dev", "prod"];

export interface Bindings {
  ENV?: Environment;
  AUTH_SECRET?: string;
  DATABASE_URL?: string;
  DATABASE_URL_DIRECT?: string;
  TEST_DATABASE_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_BASE_URL?: string;
  R2_MAX_UPLOAD_BYTES?: string;
  R2_MAX_ZIP_IMPORT_BYTES?: string;
  CORS_ORIGIN_REGEX?: string;
  COOKIE_DOMAIN?: string;
  COOKIE_SAMESITE?: string;
  SESSION_COOKIE_NAME?: string;
  /** Ventanas de rate limiting (formato de slowapi: "5/minute"). */
  RATE_LIMIT_LOGIN?: string;
  RATE_LIMIT_REGISTER?: string;
  RATE_LIMIT_PRESIGN?: string;
}

/** Regex CORS autoritativo en local (mismo valor que el backend Python). */
export const LOCAL_CORS_ORIGIN_REGEX =
  "http://localhost:\\d+|http://127\\.0\\.0\\.1:\\d+";

const DEFAULT_CORS_ORIGIN_REGEX =
  "https://([a-zA-Z0-9-]+\\.)?tudominio\\.com|http://localhost:\\d+";

/** Defaults de slowapi en `apps/api/app/main.py`. */
export const DEFAULT_RATE_LIMITS = {
  login: "5/minute",
  register: "3/hour",
  presign: "10/minute",
} as const;

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días

const MB = 1024 * 1024;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
  maxUploadBytes: number;
  maxZipImportBytes: number;
}

export interface AppConfig {
  env: Environment;
  isLocal: boolean;
  /** Swagger/Scalar habilitados solo en local (igual que FastAPI). */
  docsEnabled: boolean;
  /**
   * `undefined` si el binding no está: validar con `requireAuthSecret`.
   * TODO(better-auth): al montar el auth real, better-auth DEBE usar
   * `advanced.database.generateId = () => crypto.randomUUID()` porque
   * `users.id` es `uuid` (los ids `text` que genera por defecto romperían la
   * columna y las FKs). Ver comentario en `db/schema.ts`.
   */
  authSecret: string | undefined;
  /** `undefined` si el binding no está: validar con `requireDatabaseUrl`. */
  databaseUrl: string | undefined;
  databaseUrlDirect: string | undefined;
  corsOriginRegex: string;
  rateLimits: {
    login: string;
    register: string;
    presign: string;
  };
  cookie: {
    name: string;
    /** SameSite efectivo (en local nunca es "none"). */
    sameSite: "lax" | "none";
    /** `undefined` = host-only. */
    domain: string | undefined;
    secure: boolean;
    httpOnly: true;
    path: "/";
    maxAge: number;
  };
  r2: R2Config;
}

function optional(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function intOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** `ENV` inválido es un error de configuración, no un default silencioso. */
function parseEnvironment(value: string | undefined): Environment {
  const raw = optional(value);
  if (raw === undefined) return "local";
  if ((ENVIRONMENTS as readonly string[]).includes(raw)) {
    return raw as Environment;
  }
  throw new Error(
    `ENV inválido: "${raw}". Valores permitidos: ${ENVIRONMENTS.join(" | ")}.`,
  );
}

/**
 * Construye la configuración normalizada a partir de los bindings.
 * Réplica exacta de `Settings._normalize_for_env`.
 */
export function createConfig(env: Bindings): AppConfig {
  const environment = parseEnvironment(env.ENV);
  const isLocal = environment === "local";

  // `cookie_domain` vacío -> undefined; en local SIEMPRE host-only (un Domain
  // de prod en local hace que el navegador descarte el Set-Cookie).
  const rawCookieDomain = optional(env.COOKIE_DOMAIN);
  const cookieDomain = isLocal ? undefined : rawCookieDomain;

  const rawSameSite = env.COOKIE_SAMESITE === "none" ? "none" : "lax";
  // SameSite=None sobre http plano lo rechaza el navegador.
  const sameSite: "lax" | "none" = isLocal && rawSameSite === "none" ? "lax" : rawSameSite;

  const corsOriginRegex = isLocal
    ? LOCAL_CORS_ORIGIN_REGEX
    : optional(env.CORS_ORIGIN_REGEX) ?? DEFAULT_CORS_ORIGIN_REGEX;

  return {
    env: environment,
    isLocal,
    docsEnabled: isLocal,
    authSecret: optional(env.AUTH_SECRET),
    databaseUrl: optional(env.DATABASE_URL),
    databaseUrlDirect: optional(env.DATABASE_URL_DIRECT),
    corsOriginRegex,
    rateLimits: {
      login: optional(env.RATE_LIMIT_LOGIN) ?? DEFAULT_RATE_LIMITS.login,
      register: optional(env.RATE_LIMIT_REGISTER) ?? DEFAULT_RATE_LIMITS.register,
      presign: optional(env.RATE_LIMIT_PRESIGN) ?? DEFAULT_RATE_LIMITS.presign,
    },
    cookie: {
      name: optional(env.SESSION_COOKIE_NAME) ?? "session",
      sameSite,
      domain: cookieDomain,
      // SameSite=None exige Secure=True por spec; en local corremos en http.
      secure: !isLocal,
      httpOnly: true,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    r2: {
      accountId: optional(env.R2_ACCOUNT_ID) ?? "",
      accessKeyId: optional(env.R2_ACCESS_KEY_ID) ?? "",
      secretAccessKey: optional(env.R2_SECRET_ACCESS_KEY) ?? "",
      bucketName: optional(env.R2_BUCKET_NAME) ?? "",
      publicBaseUrl: optional(env.R2_PUBLIC_BASE_URL) ?? "",
      maxUploadBytes: intOrDefault(
        optional(env.R2_MAX_UPLOAD_BYTES),
        50 * MB,
      ),
      maxZipImportBytes: intOrDefault(
        optional(env.R2_MAX_ZIP_IMPORT_BYTES),
        512 * MB,
      ),
    },
  };
}

/** Secreto de firma de sesión. Falla explícito si falta el binding. */
export function requireAuthSecret(config: AppConfig): string {
  if (!config.authSecret) {
    throw new Error(
      "Falta AUTH_SECRET: configuralo en .dev.vars (local) o con `wrangler secret put AUTH_SECRET` (deploy).",
    );
  }
  return config.authSecret;
}

/** URL de Postgres (Neon HTTP). Falla explícito si falta el binding. */
export function requireDatabaseUrl(config: AppConfig): string {
  if (!config.databaseUrl) {
    throw new Error(
      "Falta DATABASE_URL: configurala en .dev.vars (local) o con `wrangler secret put DATABASE_URL` (deploy).",
    );
  }
  return config.databaseUrl;
}

/** Endpoint S3-compatible de R2 (firma de presigned URLs, fase posterior). */
export function r2Endpoint(config: AppConfig): string {
  return `https://${config.r2.accountId}.r2.cloudflarestorage.com`;
}

/** R2 habilitado = las 4 credenciales de bucket presentes. */
export function r2Enabled(config: AppConfig): boolean {
  const { accountId, accessKeyId, secretAccessKey, bucketName } = config.r2;
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName);
}

/** Dominio público de lectura del bucket (sin slash final), o undefined. */
export function r2PublicBaseUrl(config: AppConfig): string | undefined {
  return optional(config.r2.publicBaseUrl);
}
