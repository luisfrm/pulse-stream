/**
 * Errores de dominio (espejo de `app/shared/exceptions.py`).
 *
 * Los services nunca arman respuestas HTTP: lanzan estas clases y el
 * `onError` del worker las traduce a `{ "detail": ... }` con el status exacto.
 * Mensajes en español idénticos a los del backend Python: el front los muestra
 * tal cual.
 */

export class AppError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(detail?: string) {
    const resolved = detail ?? (new.target as typeof AppError).DETAIL;
    super(resolved);
    this.name = new.target.name;
    this.status = (new.target as typeof AppError).STATUS;
    this.detail = resolved;
  }

  static readonly STATUS: number = 500;
  static readonly DETAIL: string = "Error interno";
}

export class NotFoundError extends AppError {
  static override readonly STATUS = 404;
  static override readonly DETAIL = "No encontrado";
}

/** 400 con `detail` literal (códigos de fastapi-users y validaciones). */
export class BadRequestError extends AppError {
  static override readonly STATUS = 400;
}

export class UserNotFoundError extends NotFoundError {
  constructor(userId: string) {
    super(`Usuario ${userId} no existe`);
  }
}

/**
 * 404 "pelado" de fastapi-users (`/users/{id}` con un id inexistente):
 * el detail es literalmente `Not Found`, no el `No encontrado` de dominio.
 */
export class FastApiNotFoundError extends AppError {
  static override readonly STATUS = 404;
  static override readonly DETAIL = "Not Found";
}

/**
 * `{"detail": {"code": "...", "reason": "..."}}` — shape de
 * `fastapi_users.router.common.ErrorCode` (passwords inválidas).
 */
export class CodedAppError extends AppError {
  static override readonly STATUS = 400;

  readonly code: string;
  readonly reason: string;

  constructor(code: string, reason: string) {
    super(code);
    this.code = code;
    this.reason = reason;
  }

  /** Body exacto que devuelve fastapi-users para estos errores. */
  toBody(): { detail: { code: string; reason: string } } {
    return { detail: { code: this.code, reason: this.reason } };
  }
}

/** Códigos de `fastapi_users.router.common.ErrorCode` que replicamos. */
export const AUTH_ERROR_CODES = {
  loginBadCredentials: "LOGIN_BAD_CREDENTIALS",
  registerUserAlreadyExists: "REGISTER_USER_ALREADY_EXISTS",
  registerInvalidPassword: "REGISTER_INVALID_PASSWORD",
  resetPasswordBadToken: "RESET_PASSWORD_BAD_TOKEN",
  resetPasswordInvalidPassword: "RESET_PASSWORD_INVALID_PASSWORD",
  verifyUserBadToken: "VERIFY_USER_BAD_TOKEN",
  updateUserEmailAlreadyExists: "UPDATE_USER_EMAIL_ALREADY_EXISTS",
  updateUserInvalidPassword: "UPDATE_USER_INVALID_PASSWORD",
} as const;

export class UserCannotDeleteSelfError extends AppError {
  static override readonly STATUS = 400;
  static override readonly DETAIL = "Un admin no puede borrar su propia cuenta";
}

export class UserRoleCannotChangeSelfError extends AppError {
  static override readonly STATUS = 400;
  static override readonly DETAIL = "Un admin no puede quitarse su propio rol";
}

export class ArtistNotFoundError extends NotFoundError {
  constructor(artistId: string) {
    super(`Artista ${artistId} no existe`);
  }
}

export class ArtistNameTakenError extends AppError {
  static override readonly STATUS = 409;

  constructor(name: string) {
    super(`Ya existe un artista llamado '${name}'`);
  }
}

export class SongNotFoundError extends NotFoundError {
  constructor(songId: string) {
    super(`Canción ${songId} no existe`);
  }
}

export class AlbumNotFoundError extends NotFoundError {
  constructor(albumId: string) {
    super(`Álbum ${albumId} no existe`);
  }
}

/** Toda canción requiere un álbum (el cover se hereda del álbum). */
export class AlbumRequiredError extends AppError {
  static override readonly STATUS = 400;
  static override readonly DETAIL = "La canción requiere un álbum";
}

export class AlbumHasSongsError extends AppError {
  static override readonly STATUS = 400;

  constructor(albumId: string, songCount: number) {
    const noun = songCount === 1 ? "canción" : "canciones";
    super(
      `El álbum ${albumId} tiene ${songCount} ${noun}: ` +
        "reasignalas a otro álbum antes de borrarlo",
    );
  }
}

export class InvalidUploadError extends AppError {
  static override readonly STATUS = 400;

  constructor(detail: string) {
    super(detail);
  }
}

export class R2NotConfiguredError extends AppError {
  static override readonly STATUS = 503;
  static readonly DETAIL = "El storage (R2) no está configurado. Completá las env vars R2_* en el .dev.vars de apps/api-worker (local) o con `wrangler secret put` (deploy).";
}

export class PlaylistNotFoundError extends NotFoundError {
  constructor(playlistId: string) {
    super(`Playlist ${playlistId} no existe`);
  }
}

export class PlaylistForbiddenError extends AppError {
  static override readonly STATUS = 403;
  static override readonly DETAIL = "No tenés acceso a esta playlist";
}

export class PlaylistNotRefreshableError extends AppError {
  static override readonly STATUS = 400;

  constructor(playlistId: string, reason: string) {
    super(`Playlist ${playlistId} no se puede regenerar: ${reason}`);
  }
}

/** `current_user` sin sesión válida (fastapi-users responde 401 genérico). */
export class UnauthorizedError extends AppError {
  static override readonly STATUS = 401;
  static override readonly DETAIL = "Unauthorized";
}

/** `require_admin` con usuario sin rol admin. */
export class AdminRequiredError extends AppError {
  static override readonly STATUS = 403;
  static override readonly DETAIL = "Requiere permisos de administrador";
}

/** Rate limit excedido (slowapi -> 429). */
export class RateLimitExceededError extends AppError {
  static override readonly STATUS = 429;
  static override readonly DETAIL =
    "Demasiados intentos. Intentá de nuevo más tarde.";
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
