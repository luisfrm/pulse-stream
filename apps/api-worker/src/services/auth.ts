/**
 * Reglas de negocio de autenticación (espejo de `features/auth/router.py`).
 *
 * Todas las operaciones llaman a `auth.api.*` en el server (better-auth nunca
 * se expone como router HTTP). Los códigos de error de better-auth se traducen
 * a los `ErrorCode` de fastapi-users para que el body sea idéntico al de
 * Python.
 */

import { isAPIError } from "better-auth/api";

import { getAuth, type Auth } from "@/auth/auth";
import { readSetCookie } from "@/auth/cookies";
import type { UserRow } from "@/db/schema";
import type { AppConfig } from "@/env";
import {
  AUTH_ERROR_CODES,
  BadRequestError,
  CodedAppError,
  UnauthorizedError,
} from "@/lib/errors";
import { isUniqueViolation } from "@/lib/postgres";
import {
  findUserByEmail,
  findUserById,
  findUserByUsername,
} from "@/repositories/users";
import { deleteSessionByToken } from "@/repositories/sessions";
import type { UserCreate } from "@/schemas";
import { MIN_PASSWORD_LENGTH } from "@/services/users";

export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Forma mínima de las respuestas de `auth.api.*` con `returnHeaders: true`.
 * Se declara acá (en vez de dejar que el tipo se infiera como `any`) para que
 * un cambio de contrato de better-auth rompa el typecheck.
 */
interface AuthResponse<TBody> {
  headers: Headers;
  response: TBody;
}

/** Lo único que usamos de la sesión recién creada. */
interface SessionBody {
  token: string;
  user: { id: string };
}

/** `signUpEmail` puede no emitir token (autoSignIn desactivado). */
interface SignUpBody {
  token: string | null;
  user: { id: string };
}

/** Resultado de `verifyEmail` (ver `readVerifiedUserId`). */
type VerifyEmailResult = Awaited<ReturnType<Auth["api"]["verifyEmail"]>>;

/** Código de un `APIError` de better-auth (`null` si es otro tipo de error). */
function apiErrorCode(error: unknown): string | null {
  if (!isAPIError(error)) return null;
  const code = error.body?.code;
  return typeof code === "string" ? code : null;
}

/**
 * Log de un fallo de better-auth SIN el objeto crudo: puede arrastrar el body
 * de la request (password) y el token del flujo. Solo nombre y código.
 */
function logAuthFailure(event: string, error: unknown): void {
  console.warn(event, {
    name: error instanceof Error ? error.name : typeof error,
    code: apiErrorCode(error),
  });
}

/**
 * `verifyEmail` devuelve `{ status, user }` en el flujo por token, aunque
 * better-auth lo tipa como `void | { status }`: se lee el id sin castear el
 * resultado completo.
 */
function readVerifiedUserId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (!("user" in payload)) return undefined;
  const user: unknown = payload.user;
  if (typeof user !== "object" || user === null) return undefined;
  if (!("id" in user)) return undefined;
  const id: unknown = user.id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Reenvía solo lo que better-auth necesita. NO se reenvía `content-type`:
 * el body original es un form y better-auth espera el suyo propio.
 */
function authHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  const cookie = headers.get("cookie");
  if (cookie) forwarded.set("cookie", cookie);
  const userAgent = headers.get("user-agent");
  if (userAgent) forwarded.set("user-agent", userAgent);
  const ip = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for");
  if (ip) forwarded.set("x-forwarded-for", ip);
  return forwarded;
}

/** `null` -> el error original (500 + log), nunca un 400 silencioso. */
function throwMapped(
  error: unknown,
  map: (code: string) => Error | null,
): never {
  const code = apiErrorCode(error);
  if (code) {
    const mapped = map(code);
    if (mapped) throw mapped;
  }
  throw error;
}

/**
 * Login por email+password.
 *
 * `rememberMe` siempre `true` en better-auth: la sesión del servidor vive 7
 * días igual que el JWT de Python; lo que cambia con `remember` es SOLO si la
 * cookie del navegador es persistente (eso lo arma el router).
 */
export async function login(
  config: AppConfig,
  credentials: LoginCredentials,
  headers: Headers,
): Promise<string> {
  const auth = getAuth(config);

  let result: AuthResponse<SessionBody>;
  try {
    result = await auth.api.signInEmail({
      body: {
        email: credentials.username,
        password: credentials.password,
        rememberMe: true,
      },
      headers: authHeaders(headers),
      returnHeaders: true,
    });
  } catch (error) {
    throwMapped(error, (code) => {
      if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "EMAIL_NOT_VERIFIED") {
        return new BadRequestError(AUTH_ERROR_CODES.loginBadCredentials);
      }
      return null;
    });
  }

  const { token, user } = result.response;

  // fastapi-users: `authenticate() is None or not user.is_active` -> 400.
  const row = await findUserById(config, user.id);
  if (!row || !row.isActive) {
    await deleteSessionByToken(config, token);
    throw new BadRequestError(AUTH_ERROR_CODES.loginBadCredentials);
  }

  // Se devuelve el VALOR FIRMADO (`<token>.<hmac>`), no el token: el router lo
  // re-emite con los atributos de `config.cookie` (así `remember` controla el
  // `Max-Age` y no se filtran cookies extra de better-auth).
  const cookie = readSetCookie(result.headers, config.cookie.name);
  if (!cookie) throw new Error("better-auth no emitió la cookie de sesión");
  return cookie.value;
}

/** `POST /auth/logout`: exige sesión activa y la borra (204 sin body). */
export async function logout(
  config: AppConfig,
  headers: Headers,
): Promise<void> {
  const auth = getAuth(config);
  const session = await auth.api.getSession({ headers: authHeaders(headers) });
  if (!session) throw new UnauthorizedError();

  await auth.api.signOut({ headers: authHeaders(headers) });
}

/**
 * Registro público.
 *
 * El username es único case-insensitive (Python lo validaba en el manager) y
 * el email también. Se chequea ANTES de llamar a better-auth para devolver el
 * `REGISTER_USER_ALREADY_EXISTS` de fastapi-users en vez de su 422.
 *
 * `signUpEmail` inicia sesión automáticamente: esa sesión se borra para que
 * `/auth/register` NO deje al usuario logueado (comportamiento de Python).
 */
export async function register(
  config: AppConfig,
  payload: UserCreate,
): Promise<UserRow> {
  if (await findUserByEmail(config, payload.email)) {
    throw new BadRequestError(AUTH_ERROR_CODES.registerUserAlreadyExists);
  }

  const username = payload.username ?? null;
  if (username && (await findUserByUsername(config, username))) {
    throw new BadRequestError(AUTH_ERROR_CODES.registerUserAlreadyExists);
  }

  const auth = getAuth(config);

  let result: AuthResponse<SignUpBody>;
  try {
    result = await auth.api.signUpEmail({
      body: {
        email: payload.email,
        password: payload.password,
        // `name` es obligatorio en better-auth; en Python no existía el campo.
        name: username ?? payload.email.split("@")[0] ?? payload.email,
        ...(username ? { username } : {}),
      },
      returnHeaders: true,
    });
  } catch (error) {
    // Carrera entre el pre-check y el INSERT: el índice único de la DB
    // (`ux_users_username_lower` / `ix_users_email`) la corta con 23505 y el
    // body tiene que ser el mismo de fastapi-users, no un 500.
    if (isUniqueViolation(error)) {
      throw new BadRequestError(AUTH_ERROR_CODES.registerUserAlreadyExists);
    }

    throwMapped(error, (code) => {
      if (code.startsWith("USER_ALREADY_EXISTS")) {
        return new BadRequestError(AUTH_ERROR_CODES.registerUserAlreadyExists);
      }
      if (code.startsWith("PASSWORD_TOO_")) {
        return new CodedAppError(
          AUTH_ERROR_CODES.registerInvalidPassword,
          `Password should be at least ${MIN_PASSWORD_LENGTH} characters`,
        );
      }
      return null;
    });
  }

  const { token, user } = result.response;
  if (token) await deleteSessionByToken(config, token);

  const row = await findUserById(config, user.id);
  if (!row) throw new Error("El usuario registrado no se pudo leer");
  return row;
}

/**
 * `POST /auth/forgot-password`: 202 SIEMPRE (no revela si el email existe).
 * El envío real del mail es un no-op log-only, igual que en Python.
 */
export async function requestPasswordReset(
  config: AppConfig,
  email: string,
): Promise<void> {
  try {
    await getAuth(config).api.requestPasswordReset({ body: { email } });
  } catch (error) {
    // Nunca filtrar al cliente si el email existe o no. Sin el objeto crudo:
    // el body de better-auth puede arrastrar datos del usuario.
    logAuthFailure("forgot_password_failed", error);
  }
}

/** `POST /auth/reset-password`: token inválido -> 400 RESET_PASSWORD_BAD_TOKEN. */
export async function resetPassword(
  config: AppConfig,
  token: string,
  password: string,
): Promise<void> {
  try {
    await getAuth(config).api.resetPassword({
      body: { token, newPassword: password },
    });
  } catch (error) {
    throwMapped(error, (code) => {
      if (code === "INVALID_TOKEN" || code === "USER_NOT_FOUND") {
        return new BadRequestError(AUTH_ERROR_CODES.resetPasswordBadToken);
      }
      if (code.startsWith("PASSWORD_TOO_")) {
        return new CodedAppError(
          AUTH_ERROR_CODES.resetPasswordInvalidPassword,
          `Password should be at least ${MIN_PASSWORD_LENGTH} characters`,
        );
      }
      return null;
    });
  }
}

/** `POST /auth/request-verify-token`: 202 SIEMPRE (no revela si existe). */
export async function requestVerifyToken(
  config: AppConfig,
  email: string,
): Promise<void> {
  try {
    await getAuth(config).api.sendVerificationEmail({ body: { email } });
  } catch (error) {
    // 202 igual: no se revela si el email existe. Log sin objeto crudo.
    logAuthFailure("request_verify_token_failed", error);
  }
}

/** `POST /auth/verify`: 200 con el `UserRead` recién verificado. */
export async function verifyEmail(
  config: AppConfig,
  token: string,
): Promise<UserRow> {
  let result: VerifyEmailResult;
  try {
    result = await getAuth(config).api.verifyEmail({ query: { token } });
  } catch (error) {
    throwMapped(error, (code) => {
      if (
        code === "INVALID_TOKEN" ||
        code === "TOKEN_EXPIRED" ||
        code === "USER_NOT_FOUND"
      ) {
        return new BadRequestError(AUTH_ERROR_CODES.verifyUserBadToken);
      }
      return null;
    });
  }

  // better-auth tipa esta respuesta como `void | {status}` aunque el flujo por
  // token devuelve `{status, user}` (ver `api/routes/email-verification.mjs`):
  // se lee el id sin castear el resultado.
  const userId = readVerifiedUserId(result);
  const row = userId ? await findUserById(config, userId) : null;
  if (!row) throw new BadRequestError(AUTH_ERROR_CODES.verifyUserBadToken);
  return row;
}
