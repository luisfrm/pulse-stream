import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID

from app.core.config import settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.features.albums.models import Album
    from app.features.favorites.models import UserFavorite, UserFavoriteAlbum, UserFavoritePlaylist
    from app.features.listens.models import Listen
    from app.features.playlists.models import Playlist


class User(SQLAlchemyBaseUserTableUUID, Base):
    """Tabla `users`.

    Regla de enums (AGENTS.md): los valores permitidos de `role` se validan
    SOLO en Pydantic (features/users/schemas.py). La columna es VARCHAR plano
    — así un cambio de roles nunca rompe una migración de Alembic.

    `username` es opcional (nullable) para no romper usuarios previos; se
    valida unicidad (case-insensitive) en el UserManager.
    `total_plays` cuenta reproducciones del usuario (se incrementa en cada
    play registrado) — el detalle por canción vive en `listens`.
    """

    __tablename__ = "users"

    # Un usuario OAuth (Google) no tiene password local: la columna es nullable
    # y `UserManager.authenticate` rechaza el login por password (400) sin
    # tocar pwdlib. El admin local del panel sí tiene hash.
    hashed_password: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )

    # role: NULL = usuario normal (sin permisos especiales); "admin" = panel.
    # Regla de enums (AGENTS.md): los valores se validan SOLO en Pydantic.
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    username: Mapped[str | None] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )
    cover_key: Mapped[str | None] = mapped_column(String(1024))
    total_plays: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    playlists: Mapped[list["Playlist"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    favorites: Mapped[list["UserFavorite"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    favorite_playlists: Mapped[list["UserFavoritePlaylist"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    favorite_albums: Mapped[list["UserFavoriteAlbum"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    listens: Mapped[list["Listen"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def cover_url(self) -> str | None:
        """URL pública de la foto de perfil vía el dominio público de R2."""
        if self.cover_key and settings.r2_public_base_url:
            return f"{settings.r2_public_base_url.rstrip('/')}/{self.cover_key}"
        return None


class OAuthAccount(Base):
    """Cuenta de un proveedor OAuth vinculada a un usuario (Fase 0).

    El usuario OAuth no guarda tokens del proveedor: el panel (Hono) valida el
    ID token de Google y emite su propia cookie de sesión. Esta tabla es solo
    el vínculo identidad externa <-> usuario local.

    - UNIQUE(provider, provider_account_id): la misma cuenta de Google no puede
      apuntar a dos usuarios.
    - UNIQUE(user_id, provider): un usuario tiene a lo sumo una cuenta por
      proveedor (hoy solo "google").
    """

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_account_id",
            name="uq_oauth_accounts_provider_account",
        ),
        UniqueConstraint(
            "user_id",
            "provider",
            name="uq_oauth_accounts_user_provider",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "google" (VARCHAR plano: los valores permitidos viven en el proveedor,
    # no en la DB — la regla de enums aplica a valores de dominio).
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    email: Mapped[str | None] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="oauth_accounts")
