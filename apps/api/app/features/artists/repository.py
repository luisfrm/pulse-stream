import uuid

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.features.artists.models import Artist


class ArtistRepository:
    """Únicamente queries SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self, offset: int = 0, limit: int = 50, search: str | None = None
    ) -> list[Artist]:
        query = select(Artist).order_by(Artist.name)
        if search:
            query = query.where(Artist.name.ilike(f"%{search}%"))
        result = await self._session.execute(query.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def count(self, search: str | None = None) -> int:
        query = select(func.count()).select_from(Artist)
        if search:
            query = query.where(Artist.name.ilike(f"%{search}%"))
        result = await self._session.execute(query)
        return result.scalar_one()

    async def get(self, artist_id: uuid.UUID) -> Artist | None:
        # SELECT real (no identity map): respeta borrados pendientes de flush
        result = await self._session.execute(
            select(Artist).where(Artist.id == artist_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Artist | None:
        result = await self._session.execute(
            select(Artist).where(func.lower(Artist.name) == name.lower())
        )
        return result.scalar_one_or_none()

    async def create(self, name: str, image_url: str | None = None) -> Artist:
        artist = Artist(name=name, image_url=image_url)
        self._session.add(artist)
        await self._session.flush()
        return artist

    async def update(self, artist: Artist, **fields: object) -> Artist:
        for field, value in fields.items():
            setattr(artist, field, value)
        await self._session.flush()
        return artist

    async def delete(self, artist: Artist) -> None:
        await self._session.delete(artist)


async def get_artist_repository(
    session: AsyncSession = Depends(get_session),
) -> ArtistRepository:
    return ArtistRepository(session)
