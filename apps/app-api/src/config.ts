import type { Env, EnvironmentName } from "./env";

/**
 * Configuración de la app derivada de `env`.
 *
 * `ENV` es autoritativo: `local` (default) desactiva `Secure` en las cookies.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Credenciales S3-compatibles de R2 para firmar los PUT de covers.
 *
 * Cualquier campo vacío = R2 no configurado: `/uploads/presign-cover` responde
 * 503 (mismo comportamiento que `R2NotConfiguredError` de Python).
 */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface AppConfig {
  env: EnvironmentName;
  /** Sin slash final, ej. `http://localhost:3000`. */
  appUrl: string;
  /** `null` = cookie host-only. */
  cookieDomain: string | null;
  /** Allow-list exacta de orígenes con credenciales. */
  corsOrigins: string[];
  authSecret: string;
  /** Sin slash final; vacío = covers sin URL pública. */
  r2PublicBaseUrl: string;
  /** Credenciales de firma (vacías = R2 no configurado). */
  r2: R2Config;
}

const ENVIRONMENTS: readonly EnvironmentName[] = ["local", "dev", "prod"];

function readString(value: string | undefined): string {
  return (value ?? "").trim();
}

function required(name: string, value: string | undefined): string {
  const parsed = readString(value);
  if (!parsed) {
    throw new ConfigError(`Missing required environment variable: ${name}`);
  }
  return parsed;
}

function parseEnvironment(value: string | undefined): EnvironmentName {
  const raw = readString(value) || "local";
  if (!(ENVIRONMENTS as readonly string[]).includes(raw)) {
    throw new ConfigError(
      `Invalid ENV "${raw}": expected one of ${ENVIRONMENTS.join(", ")}`,
    );
  }
  return raw as EnvironmentName;
}

function parseAppUrl(value: string | undefined): string {
  const raw = required("APP_URL", value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`Invalid APP_URL: "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`APP_URL must be http(s): "${raw}"`);
  }
  // `origin` normaliza host/puerto; se descarta cualquier path/query.
  return url.origin;
}

function parseCorsOrigins(value: string | undefined, appUrl: string): string[] {
  const entries = readString(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const origins = entries.length > 0 ? entries : [appUrl];
  const normalized = origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigError(`Invalid CORS origin: "${origin}"`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new ConfigError(`CORS origin must be http(s): "${origin}"`);
    }
    return url.origin;
  });

  return [...new Set(normalized)];
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function parseConfig(env: Env): AppConfig {
  const environment = parseEnvironment(env.ENV);
  const appUrl = parseAppUrl(env.APP_URL);
  const authSecret = required("AUTH_SECRET", env.AUTH_SECRET);

  return {
    env: environment,
    appUrl,
    cookieDomain: readString(env.COOKIE_DOMAIN) || null,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS, appUrl),
    authSecret,
    r2PublicBaseUrl: trimTrailingSlashes(readString(env.R2_PUBLIC_BASE_URL)),
    r2: {
      accountId: readString(env.R2_ACCOUNT_ID),
      accessKeyId: readString(env.R2_ACCESS_KEY_ID),
      secretAccessKey: readString(env.R2_SECRET_ACCESS_KEY),
      bucketName: readString(env.R2_BUCKET_NAME),
    },
  };
}

/** URL pública de un objeto de R2 (`R2_PUBLIC_BASE_URL` + key). */
export function publicObjectUrl(
  baseUrl: string,
  key: string | null | undefined,
): string | null {
  if (!baseUrl || !key) return null;
  return `${trimTrailingSlashes(baseUrl)}/${key.replace(/^\/+/, "")}`;
}

/** URL pública de un cover (`R2_PUBLIC_BASE_URL` + `cover_key`). */
export function publicCoverUrl(
  baseUrl: string,
  coverKey: string | null,
): string | null {
  return publicObjectUrl(baseUrl, coverKey);
}
