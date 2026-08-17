import uuid

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.features.songs.models import Song


class SongRepository:
    """Únicamente queries SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
        artist_id: uuid.UUID | None = None,
    ) -> list[Song]:
        query = select(Song).options(selectinload(Song.artist)).order_by(Song.created_at.desc())
        if search:
            query = query.where(Song.title.ilike(f"%{search}%"))
        if artist_id is not None:
            query = query.where(Song.artist_id == artist_id)
        result = await self._session.execute(query.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def count(
        self, search: str | None = None, artist_id: uuid.UUID | None = None
    ) -> int:
        query = select(func.count()).select_from(Song)
        if search:
            query = query.where(Song.title.ilike(f"%{search}%"))
        if artist_id is not None:
            query = query.where(Song.artist_id == artist_id)
        result = await self._session.execute(query)
        return result.scalar_one()

    async def get(self, song_id: uuid.UUID) -> Song | None:
        result = await self._session.execute(
            select(Song)
            .options(selectinload(Song.artist))
            .where(Song.id == song_id)
        )
        return result.scalar_one_or_none()

    async def get_by_ids(self, song_ids: list[uuid.UUID]) -> dict[uuid.UUID, Song]:
        """Fetch de varias canciones con su artista; devuelve dict id->Song.

        El orden del dict no importa — quien llama reordena contra su propio
        ranking (ver listens.service.recently_played).
        """
        if not song_ids:
            return {}
        result = await self._session.execute(
            select(Song)
            .options(selectinload(Song.artist))
            .where(Song.id.in_(song_ids))
        )
        return {song.id: song for song in result.scalars().all()}

    async def create(self, **fields: object) -> Song:
        song = Song(**fields)
        self._session.add(song)
        await self._session.flush()
        return song

    async def update(self, song: Song, **fields: object) -> Song:
        for field, value in fields.items():
            setattr(song, field, value)
        await self._session.flush()
        return song

    async def delete(self, song: Song) -> None:
        await self._session.delete(song)


async def get_song_repository(
    session: AsyncSession = Depends(get_session),
) -> SongRepository:
    return SongRepository(session)
