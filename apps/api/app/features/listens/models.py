import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.features.songs.models import Song
    from app.features.users.models import User


class Listen(Base):
    """Reproducción registrada de una canción (play + fecha).

    Una fila por play: alimenta el "recientes" del usuario y el ranking
    "populares" del catálogo. Se indexa (user_id, played_at) porque las
    queries típicas son "últimas reproducciones de este usuario" y
    "count por canción en los últimos N días".

    `played_at` usa default en Python (datetime.now) y NO server_default:
    `now()` de Postgres es la hora de la transacción (igual para todas las
    filas de un batch), y acá el orden por fecha ES el comportamiento.
    """

    __tablename__ = "listens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("songs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship(back_populates="listens")
    song: Mapped["Song"] = relationship(back_populates="listened_by")