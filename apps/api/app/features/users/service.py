import uuid

from fastapi import Depends

from app.features.users.models import User
from app.features.users.repository import UserRepository, get_user_repository
from app.shared.exceptions import (
    UserCannotDeleteSelfError,
    UserNotFoundError,
    UserRoleCannotChangeSelfError,
)


class UserService:
    """Reglas de negocio de usuarios. Orquesta el repository. Nada de HTTP."""

    def __init__(
        self, repository: UserRepository = Depends(get_user_repository)
    ) -> None:
        self._repository = repository

    async def list_users(self, offset: int = 0, limit: int = 50) -> list[User]:
        return await self._repository.list(offset=offset, limit=limit)

    async def delete_user(self, actor: User, target_id: uuid.UUID) -> None:
        """Regla de negocio: un admin no puede borrarse a sí mismo."""
        if actor.id == target_id:
            raise UserCannotDeleteSelfError()

        target = await self._repository.get(target_id)
        if target is None:
            raise UserNotFoundError(target_id)

        await self._repository.delete(target)

    async def set_role(self, actor: User, target_id: uuid.UUID, role: str | None) -> User:
        """Asigna (o revoca con None) el rol de un usuario.

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
