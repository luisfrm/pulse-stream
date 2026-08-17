import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.features.listens.models import Listen


class ListenRepository:
    """Únicamente queries SQLAlchemy del historial de reproducciones."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, user_id: uuid.UUID, song_id: uuid.UUID) -> Listen:
        listen = Listen(user_id=user_id, song_id=song_id)
        self._session.add(listen)
        await self._session.flush()
        return listen

    async def last_listen(self, user_id: uuid.UUID) -> Listen | None:
        """El play más reciente del usuario (para dedupe de consecutivos)."""
        result = await self._session.execute(
            select(Listen)
            .where(Listen.user_id == user_id)
            .order_by(Listen.played_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def distinct_song_ids(
        self, user_id: uuid.UUID, offset: int = 0, limit: int = 50
    ) -> list[uuid.UUID]:
        """IDs de canciones reproducidas (sin duplicar), por último play desc.

        Un mismo tema tocado 5 veces aparece una sola vez, en la posición de su
        play más reciente — estilo "Seguí escuchando" de Spotify.
        """
        rank = func.row_number().over(
            partition_by=Listen.song_id, order_by=Listen.played_at.desc()
        )
        ranked = (
            select(Listen.song_id, Listen.played_at, rank.label("rn"))
            .where(Listen.user_id == user_id)
            .subquery()
        )
        result = await self._session.execute(
            select(ranked.c.song_id)
            .where(ranked.c.rn == 1)
            .order_by(ranked.c.played_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_distinct_songs(self, user_id: uuid.UUID) -> int:
        rank = func.row_number().over(
            partition_by=Listen.song_id, order_by=Listen.played_at.desc()
        )
        ranked = (
            select(Listen.song_id, rank.label("rn"))
            .where(Listen.user_id == user_id)
            .subquery()
        )
        result = await self._session.execute(select(func.count()).select_from(ranked).where(ranked.c.rn == 1))
        return result.scalar_one()

    async def play_count(self, song_id: uuid.UUID, since: datetime | None = None) -> int:
        """Cantidad de plays de una canción (opcionalmente desde una fecha)."""
        query = select(func.count()).select_from(Listen).where(Listen.song_id == song_id)
        if since is not None:
            query = query.where(Listen.played_at >= since)
        result = await self._session.execute(query)
        return result.scalar_one()

    async def top_song_ids(
        self, since: datetime | None = None, limit: int = 10
    ) -> list[tuple[uuid.UUID, int]]:
        """Pares (song_id, plays) de las más reproducidas, por count desc."""
        query = (
            select(Listen.song_id, func.count().label("plays"))
            .group_by(Listen.song_id)
            .order_by(func.count().desc(), Listen.song_id)
            .limit(limit)
        )
        if since is not None:
            query = query.where(Listen.played_at >= since)
        result = await self._session.execute(query)
        return [(song_id, plays) for song_id, plays in result.all()]


async def get_listen_repository(
    session: AsyncSession = Depends(get_session),
) -> ListenRepository:
    return ListenRepository(session)