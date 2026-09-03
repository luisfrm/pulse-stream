import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.features.artists.models import Artist
    from app.features.favorites.models import UserFavoriteAlbum
    from app.features.songs.models import Song


class Album(Base):
    """Tabla `albums`: un álbum pertenece a un artista y agrupa canciones.

    Borrar un álbum con canciones está BLOQUEADO a nivel API (400
    `AlbumHasSongsError` en `AlbumService.delete_album`: reasignar primero).
    El `ON DELETE SET NULL` de `songs.album_id` solo aplica a borrados fuera
    de la API (las canciones legacy sin álbum quedan sin cover).
    """

    __tablename__ = "albums"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    artist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cover_key: Mapped[str | None] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    artist: Mapped["Artist"] = relationship(back_populates="albums")
    songs: Mapped[list["Song"]] = relationship(back_populates="album")
    favorited_by: Mapped[list["UserFavoriteAlbum"]] = relationship(
        back_populates="album", cascade="all, delete-orphan"
    )

    @property
    def cover_url(self) -> str | None:
        """URL pública del cover vía el dominio público de R2."""
        if self.cover_key and settings.r2_public_base_url:
            return f"{settings.r2_public_base_url.rstrip('/')}/{self.cover_key}"
        return None
