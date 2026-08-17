import uuid
from enum import Enum

from fastapi_users import schemas as users_schemas
from pydantic import BaseModel


class UserRole(str, Enum):
    """Roles de usuario.

    Enums viven SOLO en Pydantic (AGENTS.md) — en la DB la columna es VARCHAR.

    Semántica (Fase 2): `role` es **null** para un usuario normal (sin permisos
    especiales) o el string `"admin"` para acceso al panel. No hay más valores.
    """

    ADMIN = "admin"


class UserRead(users_schemas.BaseUser[uuid.UUID]):
    """Respuesta pública de un usuario. `role` se coerce desde el VARCHAR."""

    role: UserRole | None = None


class UserCreate(users_schemas.BaseUserCreate):
    """Registro público: email + password.

    El rol NO se acepta acá: un usuario no puede auto-asignarse admin.
    El rol se gestiona solo por un admin (PATCH /admin/users/{id}/role).
    """


class UserUpdate(users_schemas.BaseUserUpdate):
    """Actualización de un usuario (self o admin)."""

    role: UserRole | None = None


class UserRoleUpdate(BaseModel):
    """Asignación explícita de rol (admin only).

    `role: null` revoca el admin (usuario normal); `role: "admin"` lo otorga.
    Campo requerido — distingue "no enviado" (422) de "revocar" (null).
    """

    role: UserRole | None
