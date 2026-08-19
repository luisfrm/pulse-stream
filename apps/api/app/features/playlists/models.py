import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.features.favorites.models import UserFavoritePlaylist
    from app.features.songs.models import Song
    from app.features.users.models import User


class Playlist(Base):
    """Playlist de un usuario (estilo Spotify).

    - `owner_id` -> users (cascade delete: si el usuario se borra, se van sus playlists)
    - `items` -> PlaylistSong (tabla asociativa con posición para el orden)
    - `is_public`: false = solo el dueño la ve (y la modifica)
    - `query`: solo en las `system` — la query de snapshot (top_week/top_month/new)
      que la generó, para poder regenerarla con POST /playlists/system/{id}/refresh.
    """

    __tablename__ = "playlists"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # kind: "user" (playlist personal) | "system" (curada por el sistema desde
    # el panel). Regla de enums: VARCHAR plano, valores validados en Pydantic.
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default="user", server_default=text("'user'")
    )
    # query de snapshot (solo system): "top_week" | "top_month" | "new".
    # VARCHAR plano — los valores se validan solo en Pydantic (PlaylistSystemQuery).
    query: Mapped[str | None] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    cover_key: Mapped[str | None] = mapped_column(String(1024))
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
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

    owner: Mapped["User"] = relationship(back_populates="playlists")
    items: Mapped[list["PlaylistSong"]] = relationship(
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="PlaylistSong.position",
    )
    favorited_by: Mapped[list["UserFavoritePlaylist"]] = relationship(
        back_populates="playlist", cascade="all, delete-orphan"
    )

    @property
    def songs(self) -> list["Song"]:
        return [item.song for item in self.items]

    @property
    def song_count(self) -> int:
        return len(self.items)

    @property
    def owner_email(self) -> str | None:
        """Email del dueño (para mostrar el autor en el feed público)."""
        return self.owner.email if self.owner else None

    @property
    def cover_url(self) -> str | None:
        """URL pública del cover vía el dominio público de R2."""
        if self.cover_key and settings.r2_public_base_url:
            return f"{settings.r2_public_base_url.rstrip('/')}/{self.cover_key}"
        return None


class PlaylistSong(Base):
    """Asociación playlist <-> canción con posición (orden manual).

    PK compuesta (playlist_id, song_id): una canción entra una sola vez por
    playlist. `position` arranca en 0 y se renumera al quitar.
    """

    __tablename__ = "playlist_songs"

    playlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    playlist: Mapped[Playlist] = relationship(back_populates="items")
    song: Mapped["Song"] = relationship(back_populates="playlist_items")
