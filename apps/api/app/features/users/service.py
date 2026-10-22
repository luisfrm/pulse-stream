import uuid

from fastapi import Depends
from pwdlib import PasswordHash

from app.features.users.panel_models import PanelUser
from app.features.users.repository import UserRepository, get_user_repository
from app.features.users.schemas import InitCreate
from app.shared.exceptions import (
    PanelAlreadyInitializedError,
    UserCannotDeleteSelfError,
    UserNotFoundError,
    UserRoleCannotChangeSelfError,
)

# Mismo hasher que usa fastapi-users (`pwdlib.PasswordHash.recommended()`).
_password_hash = PasswordHash.recommended()


class UserService:
    """Reglas de negocio de `panel_users`. Orquesta el repository. Nada de HTTP."""

    def __init__(
        self, repository: UserRepository = Depends(get_user_repository)
    ) -> None:
        self._repository = repository

    async def list_users(self, offset: int = 0, limit: int = 50) -> list[PanelUser]:
        return await self._repository.list(offset=offset, limit=limit)

    async def delete_user(self, actor: PanelUser, target_id: uuid.UUID) -> None:
        """Regla de negocio: un admin no puede borrarse a sí mismo."""
        if actor.id == target_id:
            raise UserCannotDeleteSelfError()

        target = await self._repository.get(target_id)
        if target is None:
            raise UserNotFoundError(target_id)

        await self._repository.delete(target)

    async def set_role(
        self, actor: PanelUser, target_id: uuid.UUID, role: str | None
    ) -> PanelUser:
        """Asigna (o revoca con None) el rol de una cuenta del panel.

        Regla de negocio: un admin no puede quitarse su propio rol — se
        quedaría sin acceso al panel sin posibilidad de revertirlo.
        """
        if actor.id == target_id and role != "admin":
            raise UserRoleCannotChangeSelfError()

        target = await self._repository.get(target_id)
        if target is None:
            raise UserNotFoundError(target_id)

        await self._repository.update_role(target, role)
        return target

    async def needs_init(self) -> bool:
        return await self._repository.count() == 0

    async def create_first_admin(self, payload: InitCreate) -> PanelUser:
        """Crea el primer admin SOLO si `panel_users` está vacío.

        Usa un advisory lock para que dos POST concurrentes no creen dos
        admins. El rol se fija acá (`admin`), nunca desde el body.
        """
        await self._repository.lock_init()
        if await self._repository.count() > 0:
            raise PanelAlreadyInitializedError()

        return await self._repository.create(
            email=str(payload.email).strip().lower(),
            hashed_password=_password_hash.hash(payload.password),
            username=payload.username.strip() if payload.username else None,
            role="admin",
        )
