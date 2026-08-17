import uuid

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.features.users.models import User


class UserRepository:
    """Únicamente queries SQLAlchemy. Sin lógica de negocio ni HTTP."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self, offset: int = 0, limit: int = 50) -> list[User]:
        result = await self._session.execute(
            select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def delete(self, user: User) -> None:
        await self._session.delete(user)


async def get_user_repository(
    session: AsyncSession = Depends(get_session),
) -> UserRepository:
    """Dependency: compone la sesión de DB con el repository (DI vía Depends)."""
    return UserRepository(session)
