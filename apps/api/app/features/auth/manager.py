import uuid
from collections.abc import AsyncIterator

import structlog
from fastapi import Depends, HTTPException, Request, status as http_status
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, exceptions
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.features.auth.backend import auth_backend
from app.features.users.models import User

logger = structlog.get_logger(__name__)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.auth_secret
    verification_token_secret = settings.auth_secret

    async def _find_by_username(
        self, username: str, *, exclude_id: uuid.UUID | None = None
    ) -> User | None:
        """Busca un usuario por username (case-insensitive)."""
        query = select(User).where(
            func.lower(User.username) == username.strip().lower()
        )
        if exclude_id is not None:
            query = query.where(User.id != exclude_id)
        result = await self.user_db.session.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self,
        user_create,
        safe: bool = False,
        request: Request | None = None,
    ) -> User:
        """Registro: valida unicidad de username (además del email)."""
        username = getattr(user_create, "username", None)
        if username:
            existing = await self._find_by_username(username)
            if existing is not None:
                raise exceptions.UserAlreadyExists()
        return await super().create(user_create, safe=safe, request=request)

    async def update(
        self,
        user_update,
        user: User,
        safe: bool = False,
        request: Request | None = None,
    ) -> User:
        """Update: valida unicidad de username (además del email)."""
        data = (
            user_update.create_update_dict()
            if safe
            else user_update.create_update_dict_superuser()
        )
        username = data.get("username")
        if username:
            existing = await self._find_by_username(username, exclude_id=user.id)
            if existing is not None:
                raise exceptions.UserAlreadyExists()
        return await super().update(user_update, user, safe=safe, request=request)

    async def on_after_register(
        self, user: User, request: Request | None = None
    ) -> None:
        logger.info("user_registered", user_id=str(user.id), email=user.email)

    async def on_after_login(
        self, user: User, request: Request | None = None, response=None
    ) -> None:
        logger.info("user_logged_in", user_id=str(user.id))


async def get_user_db(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[SQLAlchemyUserDatabase[User, uuid.UUID]]:
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase[User, uuid.UUID] = Depends(get_user_db),
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db)


fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

# Dependencies reutilizables de autenticación.
current_user = fastapi_users.current_user(active=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)


async def require_admin(user: User = Depends(current_user)) -> User:
    """Requiere rol admin (role=admin o is_superuser) en endpoints mutantes.

    Plan sección 13: creación/edición de artists/songs y /users requieren admin.
    """
    if not user.is_superuser and user.role != "admin":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Requiere permisos de administrador",
        )
    return user
