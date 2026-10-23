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
  /**
   * Origin público de la API. better-auth lo necesita como `baseURL` para
   * firmar URLs internas (no se expone ningún endpoint suyo). Default:
   * `http://localhost:8787` (el puerto del worker en local).
   */
  API_URL?: string;
  DATABASE_URL?: string;
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
  /** Resend: envío del mail de reset de contraseña (secret en deploy). */
  RESEND_API_KEY?: string;
  /** Remitente verificado en Resend (`Pulse Stream <no-reply@dominio>`). */
  EMAIL_FROM?: string;
  /** Origin del web: arma el link `/reset-password?token=...` del mail. */
  WEB_APP_URL?: string;
  /** Ventanas de rate limiting (formato de slowapi: "5/minute"). */
  RATE_LIMIT_LOGIN?: string;
  RATE_LIMIT_REGISTER?: string;
  RATE_LIMIT_PRESIGN?: string;
  RATE_LIMIT_FORGOT_PASSWORD?: string;
  /**
   * Apaga el rate limiting SOLO fuera de prod (tests). En prod se ignora:
   * un flag de entorno no puede desactivar una defensa en producción.
   */
  RATE_LIMIT_DISABLED?: string;
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
  // Más laxo: un usuario que no recuerda su password puede reintentar; el
  // link igual invalida el anterior. Frena el abuso del envío de mails.
  forgotPassword: "5/hour",
} as const;

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días

/** Nombre por defecto de la cookie de sesión (el que lee `apps/web/proxy.ts`). */
export const DEFAULT_SESSION_COOKIE_NAME = "session";

/** Puerto del worker en local (`wrangler dev --port 8787`). */
const DEFAULT_API_URL = "http://localhost:8787";

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
  /** `baseURL` de better-auth (nunca se monta su router HTTP). */
  apiUrl: string;
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
  corsOriginRegex: string;
  /**
   * Envío de emails (reset de contraseña) por Resend REST.
   *
   * `resendApiKey`/`from` pueden faltar en local: `sendEmail` lo loguea y no
   * rompe (el link se loguea en desarrollo). En prod son obligatorios
   * (`assertProdConfig`).
   */
  email: {
    resendApiKey: string | undefined;
    from: string | undefined;
    /** Origin del web que recibe el link del mail (nunca el del browser). */
    webAppUrl: string;
  };
  rateLimits: {
    login: string;
    register: string;
    presign: string;
    forgotPassword: string;
  };
  /** `true` solo fuera de prod (tests): apaga slowapi y better-auth. */
  rateLimitDisabled: boolean;
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
  // `<= 0` es un valor inválido (un tope de 0 bytes bloquearía todo): se usa el
  // default en vez de propagar una config rota.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
 * Valida la configuración OBLIGATORIA de producción (fail-fast).
 *
 * Sin esto, un deploy con envs incompletos arranca y falla más tarde de forma
 * confusa (CORS rechazando todo, el player sin covers, sesiones sin firmar).
 * Acá se corta en el PRIMER request con un mensaje en español que lista TODO lo
 * que falta; el `onError` lo loguea (redactado) y responde 500.
 *
 * En `local`/`dev` no se valida (los tests y el dev server corren sin R2).
 */
export function assertProdConfig(environment: Environment, env: Bindings): void {
  if (environment !== "prod") return;

  const missing: string[] = [];

  if (!optional(env.AUTH_SECRET)) missing.push("AUTH_SECRET");
  if (!optional(env.DATABASE_URL)) missing.push("DATABASE_URL");

  const corsOriginRegex = optional(env.CORS_ORIGIN_REGEX);
  if (!corsOriginRegex) {
    missing.push("CORS_ORIGIN_REGEX");
  } else if (corsOriginRegex.includes("tudominio")) {
    // El default del repo es `...tudominio\.com...` (punto escapado en el
    // regex): se busca el dominio sin el escape para cubrir ambas formas.
    missing.push("CORS_ORIGIN_REGEX (sigue con el placeholder 'tudominio.com')");
  }

  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_BASE_URL",
  ] as const) {
    if (!optional(env[key])) missing.push(key);
  }

  // Sin estas, el mail de reset se saltearía o apuntaría a localhost: el
  // usuario pediría el link y nunca lo recibiría.
  for (const key of ["RESEND_API_KEY", "EMAIL_FROM", "WEB_APP_URL"] as const) {
    if (!optional(env[key])) missing.push(key);
  }

  if (missing.length > 0) {
    throw new Error(
      "Configuración de producción incompleta: faltan o son inválidas " +
        `${missing.join(", ")}. Configuralas con \`wrangler secret put\` ` +
        "antes de deployar (ver .dev.vars.example).",
    );
  }
}

/**
 * Construye la configuración normalizada a partir de los bindings.
 * Réplica exacta de `Settings._normalize_for_env`.
 */
export function createConfig(env: Bindings): AppConfig {
  const environment = parseEnvironment(env.ENV);
  assertProdConfig(environment, env);
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
    apiUrl: optional(env.API_URL) ?? DEFAULT_API_URL,
    authSecret: optional(env.AUTH_SECRET),
    databaseUrl: optional(env.DATABASE_URL),
    corsOriginRegex,
    email: {
      resendApiKey: optional(env.RESEND_API_KEY),
      from: optional(env.EMAIL_FROM),
      webAppUrl: optional(env.WEB_APP_URL) ?? "http://localhost:3000",
    },
    rateLimits: {
      login: optional(env.RATE_LIMIT_LOGIN) ?? DEFAULT_RATE_LIMITS.login,
      register: optional(env.RATE_LIMIT_REGISTER) ?? DEFAULT_RATE_LIMITS.register,
      presign: optional(env.RATE_LIMIT_PRESIGN) ?? DEFAULT_RATE_LIMITS.presign,
      forgotPassword:
        optional(env.RATE_LIMIT_FORGOT_PASSWORD) ??
        DEFAULT_RATE_LIMITS.forgotPassword,
    },
    // En prod SIEMPRE false: el flag existe solo para tests.
    rateLimitDisabled: environment !== "prod" && env.RATE_LIMIT_DISABLED === "true",
    cookie: {
      name: optional(env.SESSION_COOKIE_NAME) ?? DEFAULT_SESSION_COOKIE_NAME,
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
      /**
       * DESVIACIÓN deliberada del backend Python (512 MB): el body de un
       * request en Workers está capado (~100 MB en el plan pago), así que un
       * ZIP de 512 MB no puede ni llegar. 40 MB deja margen para el overhead
       * de multipart y cubre un álbum completo típico.
       *
       * PERFIL DE MEMORIA: el runtime YA tiene el body entero en memoria; el
       * parseo de `multipart/form-data` arma una copia de la parte del archivo
       * y `File.arrayBuffer()` devuelve ese mismo buffer (se envuelve en una
       * vista, sin copiarlo). En el peor caso se trabaja con ~2× el tamaño del
       * ZIP (body + parte descomprimida del multipart) más el archivo actual
       * descomprimido (tope por canción). Con 40 MB eso queda dentro del límite
       * de memoria del Worker (128 MB).
       */
      maxZipImportBytes: intOrDefault(
        optional(env.R2_MAX_ZIP_IMPORT_BYTES),
        40 * MB,
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
