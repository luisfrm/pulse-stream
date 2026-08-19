import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.features.albums.models import Album
    from app.features.playlists.models import Playlist
    from app.features.songs.models import Song
    from app.features.users.models import User


class UserFavorite(Base):
    """Canción favorita de un usuario (like, estilo Spotify "Me gusta")."""

    __tablename__ = "user_favorites"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="favorites")
    song: Mapped["Song"] = relationship(back_populates="favorited_by")


class UserFavoritePlaylist(Base):
    """Playlist favorita de un usuario (like).

    El like NO muta la playlist: las del sistema solo las muta un admin y las
    ajenas ni el dueño las toca por acá. Esta tabla es únicamente el marcador
    del usuario (biblioteca / corazones).
    """

    __tablename__ = "user_favorite_playlists"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    playlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="favorite_playlists")
    playlist: Mapped["Playlist"] = relationship(back_populates="favorited_by")


class UserFavoriteAlbum(Base):
    """Álbum favorito de un usuario (like, mismo patrón que UserFavorite)."""

    __tablename__ = "user_favorite_albums"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    album_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("albums.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="favorite_albums")
    album: Mapped["Album"] = relationship(back_populates="favorited_by")
