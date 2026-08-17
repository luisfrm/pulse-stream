import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base
from app.features.artists.models import Artist


class Song(Base):
    """Tabla `songs`.

    `genres` es una columna JSON con strings planos (regla AGENTS.md: los
    enums se validan solo en Pydantic, nunca como tipo ENUM en la DB).
    """

    __tablename__ = "songs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    artist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    genres: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default=text("'[]'::json")
    )
    lyrics: Mapped[str | None] = mapped_column(Text)
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    artist: Mapped[Artist] = relationship(back_populates="songs")

    @property
    def stream_url(self) -> str | None:
        """URL pública de reproducción vía el dominio público de R2 (si hay).

        Es presentación (no columna): la lee el schema SongRead para exponerla
        en las respuestas y en el OpenAPI sin duplicar lógica en el frontend.
        """
        if settings.r2_public_base_url:
            return f"{settings.r2_public_base_url.rstrip('/')}/{self.object_key}"
        return None
