import uuid
from collections.abc import AsyncIterator

import structlog
from fastapi import Depends, HTTPException, Request, status as http_status
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.features.auth.backend import auth_backend
from app.features.users.models import User

logger = structlog.get_logger(__name__)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.auth_secret
    verification_token_secret = settings.auth_secret

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
