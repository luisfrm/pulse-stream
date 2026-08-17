import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import current_superuser
from app.features.users.models import User
from app.features.users.schemas import UserRead
from app.features.users.service import UserService

router = APIRouter(prefix="/admin/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: UserService = Depends(),
    _: User = Depends(current_superuser),
) -> list[User]:
    """Listado de usuarios — solo admin."""
    return await service.list_users(offset=offset, limit=limit)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    service: UserService = Depends(),
    actor: User = Depends(current_superuser),
) -> None:
    """Borra un usuario — solo admin, y no puede borrarse a sí mismo."""
    await service.delete_user(actor, user_id)
