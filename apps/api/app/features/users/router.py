import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import require_admin
from app.features.users.models import User
from app.features.users.schemas import UserRead, UserRoleUpdate
from app.features.users.service import UserService

router = APIRouter(prefix="/admin/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: UserService = Depends(),
    _: User = Depends(require_admin),
) -> list[User]:
    """Listado de usuarios — solo admin (role=admin)."""
    return await service.list_users(offset=offset, limit=limit)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    service: UserService = Depends(),
    actor: User = Depends(require_admin),
) -> None:
    """Borra un usuario — solo admin, y no puede borrarse a sí mismo."""
    await service.delete_user(actor, user_id)


@router.patch("/{user_id}/role", response_model=UserRead)
async def set_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    service: UserService = Depends(),
    actor: User = Depends(require_admin),
) -> User:
    """Asigna/revoca el rol de un usuario — solo admin.

    `role: "admin"` otorga acceso al panel; `role: null` lo revoca.
    Un admin no puede quitarse su propio rol.
    """
    return await service.set_role(actor, user_id, payload.role)
