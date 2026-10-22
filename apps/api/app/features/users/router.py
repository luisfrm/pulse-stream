import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import require_admin
from app.features.users.panel_models import PanelUser
from app.features.users.schemas import UserRead, UserRoleUpdate
from app.features.users.service import UserService

router = APIRouter(prefix="/admin/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: UserService = Depends(),
    _: PanelUser = Depends(require_admin),
) -> list[PanelUser]:
    """Listado de cuentas del panel — solo admin (role=admin)."""
    return await service.list_users(offset=offset, limit=limit)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    service: UserService = Depends(),
    actor: PanelUser = Depends(require_admin),
) -> None:
    """Borra una cuenta del panel — solo admin, y no la propia."""
    await service.delete_user(actor, user_id)


@router.patch("/{user_id}/role", response_model=UserRead)
async def set_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    service: UserService = Depends(),
    actor: PanelUser = Depends(require_admin),
) -> PanelUser:
    """Asigna/revoca el rol de una cuenta del panel — solo admin.

    `role: "admin"` otorga acceso al panel; `role: null` lo revoca.
    Un admin no puede quitarse su propio rol.
    """
    return await service.set_role(actor, user_id, payload.role)
