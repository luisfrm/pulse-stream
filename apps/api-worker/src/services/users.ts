/**
 * Reglas de negocio de usuarios (espejo de `features/users/service.py`).
 *
 * Sin HTTP: reciben el `AppConfig` del request y lanzan errores de dominio que
 * `onError` traduce al body de FastAPI. Los routers solo parsean y delegan.
 */

import { setUserPassword } from "@/auth/passwords";
import type { UserRow } from "@/db/schema";
import type { AppConfig } from "@/env";
import {
  AUTH_ERROR_CODES,
  BadRequestError,
  CodedAppError,
  FastApiNotFoundError,
  UserCannotDeleteSelfError,
  UserNotFoundError,
  UserRoleCannotChangeSelfError,
} from "@/lib/errors";
import { isUniqueViolation } from "@/lib/postgres";
import { normalizeUuid } from "@/lib/uuid";
import {
  deleteUserById,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  listUsers,
  updateUserById,
  type UserPatch,
} from "@/repositories/users";
import type { UserRole, UserUpdate } from "@/schemas";

/**
 * Password mínima. Coincide con `emailAndPassword.minPasswordLength` de
 * better-auth (el registro y el reset la validan ahí; acá se replica para que
 * `PATCH /users/me` no sea un bypass).
 */
export const MIN_PASSWORD_LENGTH = 8;

export function listAllUsers(
  config: AppConfig,
  offset: number,
  limit: number,
): Promise<UserRow[]> {
  return listUsers(config, offset, limit);
}

/**
 * Parser de ids de usuario: la MISMA semántica de `uuid.UUID()` que usa el
 * resto de las rutas con path params (`lib/uuid.normalizeUuid`).
 *
 * Python usa `uuid.UUID(id)` (`user_manager.parse_id`), que acepta la forma
 * canónica, 32 hex sin guiones, `{...}` y `urn:uuid:...`; Postgres solo acepta
 * la canónica (o 32 hex). `null` = id inválido.
 */
export const normalizeUserId = normalizeUuid;

/**
 * `GET/PATCH/DELETE /users/{id}`: id inexistente o malformado -> 404 con el
 * `detail` literal de fastapi-users (`"Not Found"`), no el de dominio.
 */
export async function getUserOr404(
  config: AppConfig,
  rawId: string,
): Promise<UserRow> {
  const id = normalizeUserId(rawId);
  if (!id) throw new FastApiNotFoundError();

  const row = await findUserById(config, id);
  if (!row) throw new FastApiNotFoundError();
  return row;
}

/**
 * `DELETE /users/{id}` (solo superusuario).
 *
 * Paridad con Python: este endpoint NO tiene guard de auto-borrado (el guard
 * vive solo en `/admin/users/{user_id}`); el `getUserOr404` mantiene el 404.
 */
export async function deleteUserAsSuperuser(
  config: AppConfig,
  rawId: string,
): Promise<void> {
  const target = await getUserOr404(config, rawId);
  await deleteUserById(config, target.id);
}

/** Un admin no puede borrarse a sí mismo ni borrar a un usuario inexistente. */
export async function deleteUserAsAdmin(
  config: AppConfig,
  actor: UserRow,
  targetId: string,
): Promise<void> {
  if (actor.id === targetId) throw new UserCannotDeleteSelfError();

  const target = await findUserById(config, targetId);
  if (!target) throw new UserNotFoundError(targetId);

  await deleteUserById(config, targetId);
}

/** `role: null` revoca el admin. Nadie puede quitarse su propio rol. */
export async function setRoleAsAdmin(
  config: AppConfig,
  actor: UserRow,
  targetId: string,
  role: UserRole | null,
): Promise<UserRow> {
  if (actor.id === targetId && role !== "admin") {
    throw new UserRoleCannotChangeSelfError();
  }

  const target = await findUserById(config, targetId);
  if (!target) throw new UserNotFoundError(targetId);

  const updated = await updateUserById(config, targetId, { role });
  return updated ?? target;
}

/**
 * `PATCH /users/me` y `PATCH /users/{id}`.
 *
 * Solo email/username/password/cover_key: los campos de privilegio
 * (`role`, `is_superuser`, `is_active`, `is_verified`) ni siquiera existen en
 * `UserUpdate`, así que zod los descarta antes de llegar acá (en Python eran
 * una escalada de privilegios real).
 */
export async function updateProfile(
  config: AppConfig,
  target: UserRow,
  payload: UserUpdate,
): Promise<UserRow> {
  const patch: UserPatch = {};

  if (payload.email !== undefined && payload.email !== target.email) {
    const existing = await findUserByEmail(config, payload.email);
    if (existing && existing.id !== target.id) {
      throw new BadRequestError(AUTH_ERROR_CODES.updateUserEmailAlreadyExists);
    }
    patch.email = payload.email;
  }

  if (payload.username !== undefined) {
    if (payload.username === null) {
      patch.username = null;
    } else {
      const existing = await findUserByUsername(
        config,
        payload.username,
        target.id,
      );
      // Python reusaba `UserAlreadyExists` para el username duplicado.
      if (existing) {
        throw new BadRequestError(AUTH_ERROR_CODES.updateUserEmailAlreadyExists);
      }
      patch.username = payload.username;
    }
  }

  if (payload.cover_key !== undefined) {
    patch.coverKey = payload.cover_key;
  }

  if (payload.password !== undefined) {
    if (payload.password.length < MIN_PASSWORD_LENGTH) {
      throw new CodedAppError(
        AUTH_ERROR_CODES.updateUserInvalidPassword,
        `Password should be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    await setUserPassword(config, target.id, payload.password);
  }

  let updated: UserRow | null;
  try {
    updated = await updateUserById(config, target.id, patch);
  } catch (error) {
    // Carrera entre el chequeo de unicidad y el UPDATE: los índices de
    // `users` (email / lower(username)) devuelven 23505 y el body debe ser el
    // mismo que lanzaba Python, no un 500.
    if (isUniqueViolation(error)) {
      throw new BadRequestError(AUTH_ERROR_CODES.updateUserEmailAlreadyExists);
    }
    throw error;
  }

  return updated ?? target;
}
