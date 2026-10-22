import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Integer,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.features.albums.models import Album
    from app.features.favorites.models import UserFavorite, UserFavoriteAlbum, UserFavoritePlaylist
    from app.features.listens.models import Listen
    from app.features.playlists.models import Playlist

# Usuario fijo que posee las playlists del sistema.
SYSTEM_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
SYSTEM_USER_EMAIL = "system@pulse-stream.app"


class User(Base):
    """Tabla `users`: usuarios públicos de la app (Hono).

    Desde la migración 0012 la autenticación del panel/admin vive en
    `panel_users`. Esta tabla es el target de las FKs de la app (playlists,
    favoritos, listens) y la usa el auth custom de Hono. `hashed_password` se
    mantiene por compatibilidad con el auth actual de la app (se elimina en una
    fase posterior). `role`/`is_superuser` quedan como columnas legacy: NO
    otorgan acceso al panel.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        nullable=False, default=True, server_default=text("true")
    )
    is_superuser: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default=text("false")
    )
    is_verified: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default=text("false")
    )
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
