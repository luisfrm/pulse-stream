import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

import type { GoogleConfig } from "../config";
import { AppError, ServiceUnavailableError } from "../lib/errors";

/**
 * Google OAuth 2.0 + OpenID Connect (authorization code con PKCE S256).
 *
 * El `state` que viaja a Google NO es el valor plano: la cookie `oauth_state`
 * es un JWT firmado (HS256) que contiene `state`, el `codeVerifier` de PKCE y
 * el `returnTo`. El callback exige que `state` (query) coincida en tiempo
 * constante con el del JWT y que la firma/aud/exp sean válidas.
 */
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
] as const;

export const OAUTH_STATE_AUDIENCE = "pulse-oauth-state";
export const OAUTH_STATE_ISSUER = "pulse-app";
export const OAUTH_STATE_TTL_SECONDS = 60 * 10;
export const GOOGLE_SCOPE = "openid email profile";

const OAUTH_STATE_ALGORITHM = "HS256";
const CODE_VERIFIER_BYTES = 32;

export class OAuthStateError extends AppError {
  constructor(message = "Invalid OAuth state") {
    super(400, message);
    this.name = "OAuthStateError";
  }
}

export class GoogleAuthError extends AppError {
  constructor(message: string, status = 400) {
    super(status, message);
    this.name = "GoogleAuthError";
  }
}

export interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: true;
}

export interface BuildGoogleAuthUrlParams {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}

export interface ExchangeCodeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export interface GoogleTokenSet {
  idToken: string;
}

export interface GoogleClient {
  buildAuthUrl(params: { state: string; codeChallenge: string }): string;
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
  }): Promise<GoogleTokenSet>;
  verifyIdToken(idToken: string): Promise<GoogleIdentity>;
}

export interface GoogleClientDependencies {
  /** Inyectable en tests; por defecto el `fetch` global del runtime. */
  fetch?: typeof fetch;
  /** Inyectable en tests para evitar el JWKS real de Google. */
  verifyIdToken?: (idToken: string) => Promise<GoogleIdentity>;
}

function encodeSecret(secret: string): Uint8Array {
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign/verify OAuth state");
  }
  return new TextEncoder().encode(secret);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function createState(): string {
  return randomBase64Url(24);
}

/** PKCE code_verifier (43 chars base64url, RFC 7636). */
export function createCodeVerifier(): string {
  return randomBase64Url(CODE_VERIFIER_BYTES);
}

/** PKCE S256: BASE64URL(SHA256(ASCII(code_verifier))). */
export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return toBase64Url(new Uint8Array(digest));
}

/** Comparación en tiempo constante para el `state` (longitudes distintas → false). */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function signOAuthState(
  payload: OAuthStatePayload,
  secret: string,
  ttlSeconds: number = OAUTH_STATE_TTL_SECONDS,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({
    state: payload.state,
    codeVerifier: payload.codeVerifier,
    returnTo: payload.returnTo,
  })
    .setProtectedHeader({ alg: OAUTH_STATE_ALGORITHM, typ: "JWT" })
    .setAudience(OAUTH_STATE_AUDIENCE)
    .setIssuer(OAUTH_STATE_ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(encodeSecret(secret));
}

export async function verifyOAuthState(
  token: string,
  secret: string,
): Promise<OAuthStatePayload> {
  let payload: Record<string, unknown>;

  try {
    const verified = await jwtVerify(token, encodeSecret(secret), {
      algorithms: [OAUTH_STATE_ALGORITHM],
      audience: OAUTH_STATE_AUDIENCE,
      issuer: OAUTH_STATE_ISSUER,
    });
    payload = verified.payload;
  } catch {
    throw new OAuthStateError();
  }

  const { state, codeVerifier, returnTo } = payload;
  if (
    typeof state !== "string" ||
    typeof codeVerifier !== "string" ||
    typeof returnTo !== "string"
  ) {
    throw new OAuthStateError();
  }

  return { state, codeVerifier, returnTo };
}

export function buildGoogleAuthUrl({
  state,
  codeChallenge,
  redirectUri,
  clientId,
}: BuildGoogleAuthUrlParams): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCode({
  code,
  codeVerifier,
  redirectUri,
  clientId,
  clientSecret,
  fetch: fetchImpl,
}: ExchangeCodeParams): Promise<GoogleTokenSet> {
  const doFetch = fetchImpl ?? fetch;

  const response = await doFetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    // No se loguea el body: puede contener tokens/credenciales.
    throw new GoogleAuthError(
      `Google token exchange failed with status ${response.status}`,
      502,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new GoogleAuthError("Google token response is not valid JSON", 502);
  }

  const idToken =
    typeof data === "object" && data !== null
      ? (data as { id_token?: unknown }).id_token
      : undefined;

  if (typeof idToken !== "string" || idToken.length === 0) {
    throw new GoogleAuthError("Google token response has no id_token", 502);
  }

  return { idToken };
}

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

/**
 * Verifica el `id_token` con el JWKS de Google.
 * Exige issuer de Google, `aud === clientId` y `email_verified === true`.
 */
export async function verifyIdToken(
  idToken: string,
  options: { clientId: string },
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    algorithms: ["RS256"],
    audience: options.clientId,
    issuer: [...GOOGLE_ISSUERS],
  });

  if (payload.email_verified !== true) {
    throw new GoogleAuthError("Google account email is not verified");
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new GoogleAuthError("Google ID token has no subject");
  }

  if (typeof payload.email !== "string" || payload.email.length === 0) {
    throw new GoogleAuthError("Google ID token has no email");
  }

  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
  };
}

function assertGoogleConfigured(config: GoogleConfig): void {
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new ServiceUnavailableError("Google OAuth is not configured");
  }
}

/**
 * Cliente con la config de Google ya bindeada. Tests pueden inyectar `fetch`
 * (token exchange) y `verifyIdToken` (saltar el JWKS real).
 */
export function createGoogleClient(
  config: GoogleConfig,
  dependencies: GoogleClientDependencies = {},
): GoogleClient {
  return {
    buildAuthUrl({ state, codeChallenge }) {
      assertGoogleConfigured(config);
      return buildGoogleAuthUrl({
        state,
        codeChallenge,
        redirectUri: config.redirectUri,
        clientId: config.clientId,
      });
    },

    async exchangeCode({ code, codeVerifier }) {
      assertGoogleConfigured(config);
      return exchangeCode({
        code,
        codeVerifier,
        redirectUri: config.redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        fetch: dependencies.fetch,
      });
    },

    async verifyIdToken(idToken) {
      assertGoogleConfigured(config);
      if (dependencies.verifyIdToken) {
        return dependencies.verifyIdToken(idToken);
      }
      return verifyIdToken(idToken, { clientId: config.clientId });
    },
  };
}
