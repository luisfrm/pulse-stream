import uuid

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.features.users.panel_models import PanelUser

# Clave arbitraria del advisory lock que serializa el bootstrap del panel
# (`/init`). Cualquier valor fijo sirve; debe ser el mismo en todos los workers.
_INIT_LOCK_KEY = 848_012


class UserRepository:
    """Únicamente queries SQLAlchemy de `panel_users`. Sin lógica de negocio."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self, offset: int = 0, limit: int = 50) -> list[PanelUser]:
        result = await self._session.execute(
            select(PanelUser)
            .order_by(PanelUser.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get(self, user_id: uuid.UUID) -> PanelUser | None:
        return await self._session.get(PanelUser, user_id)

    async def count(self) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(PanelUser)
        )
        return result.scalar_one()

    async def lock_init(self) -> None:
        """Serializa la creación del primer admin (evita dobles requests)."""
        await self._session.execute(
            select(func.pg_advisory_xact_lock(_INIT_LOCK_KEY))
        )

    async def create(
        self,
        *,
        email: str,
        hashed_password: str,
        username: str | None,
        role: str,
        is_active: bool = True,
        is_verified: bool = True,
    ) -> PanelUser:
        user = PanelUser(
            email=email,
            hashed_password=hashed_password,
            username=username,
            role=role,
            is_active=is_active,
            is_verified=is_verified,
            is_superuser=False,
        )
        self._session.add(user)
        await self._session.flush()
        return user

    async def delete(self, user: PanelUser) -> None:
        await self._session.delete(user)

    async def update_role(self, user: PanelUser, role: str | None) -> None:
        """Actualiza el rol (null = sin acceso al panel, 'admin' = admin)."""
        user.role = role
        await self._session.flush()


async def get_user_repository(
    session: AsyncSession = Depends(get_session),
) -> UserRepository:
    """Dependency: compone la sesión de DB con el repository (DI vía Depends)."""
    return UserRepository(session)
