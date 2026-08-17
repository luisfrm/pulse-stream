import uuid
from enum import Enum

from fastapi_users import schemas as users_schemas


class UserRole(str, Enum):
    """Roles de usuario.

    Enums viven SOLO en Pydantic (AGENTS.md) — en la DB la columna es VARCHAR.
    """

    ADMIN = "admin"
    USER = "user"


class UserRead(users_schemas.BaseUser[uuid.UUID]):
    """Respuesta pública de un usuario. `role` se coerce desde el VARCHAR."""

    role: UserRole


class UserCreate(users_schemas.BaseUserCreate):
    """Registro público: email + password.

    El rol NO se acepta acá: un usuario no puede auto-asignarse admin.
    El rol se gestiona solo por un admin.
    """


class UserUpdate(users_schemas.BaseUserUpdate):
    """Actualización de un usuario (self o admin)."""

    role: UserRole | None = None
