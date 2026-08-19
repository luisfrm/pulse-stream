from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, func, text
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

    @property
    def cover_url(self) -> str | None:
        """URL pública de la foto de perfil vía el dominio público de R2."""
        if self.cover_key and settings.r2_public_base_url:
            return f"{settings.r2_public_base_url.rstrip('/')}/{self.cover_key}"
        return None
