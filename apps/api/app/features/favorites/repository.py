import uuid

from fastapi import Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.features.favorites.models import UserFavorite
from app.features.songs.models import Song


class FavoriteRepository:
    """Únicamente queries SQLAlchemy de favoritos."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_song_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        result = await self._session.execute(
            select(UserFavorite.song_id).where(UserFavorite.user_id == user_id)
        )
        return set(result.scalars().all())

    async def list_songs(
        self, user_id: uuid.UUID, offset: int = 0, limit: int = 50
    ) -> list[Song]:
        """Canciones favoritas ordenadas por fecha de like (más recientes primero)."""
        result = await self._session.execute(
            select(Song)
            .join(UserFavorite, UserFavorite.song_id == Song.id)
            .options(selectinload(Song.artist))
            .where(UserFavorite.user_id == user_id)
            .order_by(UserFavorite.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count(self, user_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(Song.id)
            .join(UserFavorite, UserFavorite.song_id == Song.id)
            .where(UserFavorite.user_id == user_id)
        )
        return len(result.scalars().all())

    async def add(self, user_id: uuid.UUID, song_id: uuid.UUID) -> None:
        """Agrega el like (no-op si ya existía)."""
        existing = await self._session.get(UserFavorite, (user_id, song_id))
        if existing is None:
            self._session.add(UserFavorite(user_id=user_id, song_id=song_id))
            await self._session.flush()

    async def remove(self, user_id: uuid.UUID, song_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(UserFavorite).where(
                UserFavorite.user_id == user_id, UserFavorite.song_id == song_id
            )
        )
        await self._session.flush()
        return result.rowcount > 0


async def get_favorite_repository(
    session: AsyncSession = Depends(get_session),
) -> FavoriteRepository:
    return FavoriteRepository(session)
