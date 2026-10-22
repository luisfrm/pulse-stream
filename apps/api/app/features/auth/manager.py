import uuid
from collections.abc import AsyncIterator

import structlog
from fastapi import Depends, HTTPException, Request, status as http_status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, exceptions
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session
from app.features.auth.backend import auth_backend
from app.features.users.panel_models import PanelUser

logger = structlog.get_logger(__name__)


class UserManager(UUIDIDMixin, BaseUserManager[PanelUser, uuid.UUID]):
    """Manager de fastapi-users para las cuentas del panel (`panel_users`)."""

    reset_password_token_secret = settings.auth_secret
    verification_token_secret = settings.auth_secret

    async def _find_by_username(
        self, username: str, *, exclude_id: uuid.UUID | None = None
    ) -> PanelUser | None:
        """Busca una cuenta por username (case-insensitive)."""
        query = select(PanelUser).where(
            func.lower(PanelUser.username) == username.strip().lower()
        )
        if exclude_id is not None:
            query = query.where(PanelUser.id != exclude_id)
        result = await self.user_db.session.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self,
        user_create,
        safe: bool = False,
        request: Request | None = None,
    ) -> PanelUser:
        """Alta: valida unicidad de username (además del email)."""
        username = getattr(user_create, "username", None)
        if username:
            existing = await self._find_by_username(username)
            if existing is not None:
                raise exceptions.UserAlreadyExists()
        return await super().create(user_create, safe=safe, request=request)

    async def update(
        self,
        user_update,
        user: PanelUser,
        safe: bool = False,
        request: Request | None = None,
    ) -> PanelUser:
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

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm
    ) -> PanelUser | None:
        """Login por email + password; las cuentas sin hash no entran."""
        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            # Run the hasher to mitigate timing attack
            # Inspired from Django: https://code.djangoproject.com/ticket/20760
            self.password_helper.hash(credentials.password)
            return None

        if user.hashed_password is None:
            # Cuenta legacy sin password local. Mismo costo de hashing que un
            # login real para no filtrar la existencia del email por timing.
            self.password_helper.hash(credentials.password)
            return None

        verified, updated_password_hash = self.password_helper.verify_and_update(
            credentials.password, user.hashed_password
        )
        if not verified:
            return None
        # Update password hash to a more robust one if needed
        if updated_password_hash is not None:
            await self.user_db.update(
                user, {"hashed_password": updated_password_hash}
            )

        return user

    async def on_after_register(
        self, user: PanelUser, request: Request | None = None
    ) -> None:
        logger.info("panel_user_registered", user_id=str(user.id), email=user.email)

    async def on_after_login(
        self, user: PanelUser, request: Request | None = None, response=None
    ) -> None:
        logger.info("panel_user_logged_in", user_id=str(user.id))


async def get_user_db(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[SQLAlchemyUserDatabase[PanelUser, uuid.UUID]]:
    yield SQLAlchemyUserDatabase(session, PanelUser)


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase[PanelUser, uuid.UUID] = Depends(get_user_db),
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db)


fastapi_users = FastAPIUsers[PanelUser, uuid.UUID](get_user_manager, [auth_backend])

# Dependencies reutilizables de autenticación.
current_user = fastapi_users.current_user(active=True)


async def require_admin(user: PanelUser = Depends(current_user)) -> PanelUser:
    """Requiere `role="admin"` en `panel_users`.

    `is_superuser` existe porque fastapi-users lo exige, pero NO autoriza.
    """
    if user.role != "admin":
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Requiere permisos de administrador",
        )
    return user
