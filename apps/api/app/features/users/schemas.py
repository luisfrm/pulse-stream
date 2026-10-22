import uuid
from enum import Enum

from fastapi_users import schemas as users_schemas
from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    """Roles del panel.

    Enums viven SOLO en Pydantic (AGENTS.md) — en la DB la columna es VARCHAR.

    Semántica: `role` es **null** para una cuenta sin acceso al panel o el
    string `"admin"` para acceso completo. No hay más valores. `is_superuser`
    existe porque fastapi-users lo exige, pero no se usa para autorizar.
    """

    ADMIN = "admin"


class UserRead(users_schemas.BaseUser[uuid.UUID]):
    """Respuesta pública de una cuenta del panel. `role` se coerce del VARCHAR."""

    role: UserRole | None = None
    username: str | None = None
    cover_key: str | None = None
    # Se lee desde la propiedad `PanelUser.cover_url` (ver panel_models.py).
    cover_url: str | None = None
    total_plays: int = 0


class UserUpdate(users_schemas.BaseUserUpdate):
    """Actualización de la propia cuenta del panel.

    El rol NO se acepta acá: se gestiona solo con
    `PATCH /admin/users/{id}/role` (un admin no puede autoasignarse permisos).
    """

    username: str | None = Field(
        default=None, min_length=2, max_length=50, pattern=r"^[\w.\- ]+$"
    )
    # Solo keys del presign (`covers/{uuid}.webp`): rechaza el bypass por
    # PATCH directo con una key arbitraria (mismo patrón que albums/artists/
    # playlists — duplicado a propósito, sin import cruzado entre features).
    cover_key: str | None = Field(
        default=None, pattern=r"^covers/[0-9a-f-]+\.webp$"
    )


class UserRoleUpdate(BaseModel):
    """Asignación explícita de rol (admin only).

    `role: null` revoca el acceso al panel; `role: "admin"` lo otorga.
    Campo requerido — distingue "no enviado" (422) de "revocar" (null).
    """

    role: UserRole | None


class InitStatusRead(BaseModel):
    """Estado del bootstrap del panel (`GET /init/status`)."""

    needs_init: bool


class InitCreate(BaseModel):
    """Primer (y único) admin creado por `/init` cuando no hay cuentas."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(
        default=None, min_length=2, max_length=50, pattern=r"^[\w.\- ]+$"
    )
