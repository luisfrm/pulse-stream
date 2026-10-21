import { SignJWT, jwtVerify } from "jose";

/**
 * Sesión de la app: JWT HS256 en cookie HttpOnly.
 *
 * Claim set mínimo y explícito:
 * - `sub`: id del usuario (UUID);
 * - `aud`: `pulse-app` (la cookie del panel Python usa otro nombre/secret);
 * - `iss`: `pulse-app`;
 * - `exp`: 7 días.
 */
export const SESSION_AUDIENCE = "pulse-app";
export const SESSION_ISSUER = "pulse-app";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const SESSION_ALGORITHM = "HS256";

export interface SessionPayload {
  sub: string;
}

function encodeSecret(secret: string): Uint8Array {
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign/verify sessions");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Firma un token de sesión. `ttlSeconds` negativo permite fabricar tokens
 * expirados en tests sin tocar el reloj global.
 */
export async function signSession(
  subject: string,
  secret: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  if (!subject) {
    throw new Error("Cannot sign a session without a subject");
  }

  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: SESSION_ALGORITHM, typ: "JWT" })
    .setSubject(subject)
    .setAudience(SESSION_AUDIENCE)
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(encodeSecret(secret));
}

/** Verifica firma, algoritmo, `aud`, `iss` y `exp`. Lanza `JWTClaimValidationFailed`/`JWSSignatureVerificationFailed`. */
export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, encodeSecret(secret), {
    algorithms: [SESSION_ALGORITHM],
    audience: SESSION_AUDIENCE,
    issuer: SESSION_ISSUER,
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Session token has no subject");
  }

  return { sub: payload.sub };
}
