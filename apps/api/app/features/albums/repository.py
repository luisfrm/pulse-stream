import uuid

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.features.albums.models import Album
from app.features.songs.models import Song


class AlbumRepository:
    """Únicamente queries SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(
        self,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
        artist_id: uuid.UUID | None = None,
    ) -> list[Album]:
        """Álbumes (nuevos primero) con artista y song_count en un solo query.

        El count de canciones se hace con un LEFT JOIN agrupado; `song_count`
        se setea como atributo transiente (lo lee el schema, from_attributes).
        """
        song_count = func.count(Song.id).label("song_count")
        query = (
            select(Album, song_count)
            .outerjoin(Song, Song.album_id == Album.id)
            .options(selectinload(Album.artist))
            .group_by(Album.id)
            .order_by(Album.created_at.desc())
        )
        if search:
            query = query.where(Album.title.ilike(f"%{search}%"))
        if artist_id is not None:
            query = query.where(Album.artist_id == artist_id)
        result = await self._session.execute(query.offset(offset).limit(limit))
        albums: list[Album] = []
        for album, count in result.all():
            album.song_count = count  # type: ignore[attr-defined]
            albums.append(album)
        return albums

    async def count(
        self, search: str | None = None, artist_id: uuid.UUID | None = None
    ) -> int:
        query = select(func.count()).select_from(Album)
        if search:
            query = query.where(Album.title.ilike(f"%{search}%"))
        if artist_id is not None:
            query = query.where(Album.artist_id == artist_id)
        result = await self._session.execute(query)
        return result.scalar_one()

    async def get(self, album_id: uuid.UUID) -> Album | None:
        """Detalle: artista + canciones (con sus artistas) cargados."""
        result = await self._session.execute(
            select(Album)
            .options(
                selectinload(Album.artist),
                selectinload(Album.songs).selectinload(Song.artist),
            )
            .where(Album.id == album_id)
        )
        album = result.scalar_one_or_none()
        if album is not None:
            album.song_count = len(album.songs)  # type: ignore[attr-defined]
        return album

    async def get_by_ids(self, album_ids: list[uuid.UUID]) -> dict[uuid.UUID, Album]:
        if not album_ids:
            return {}
        result = await self._session.execute(
            select(Album)
            .options(selectinload(Album.artist))
            .where(Album.id.in_(album_ids))
        )
        return {album.id: album for album in result.scalars().all()}

    async def create(self, **fields: object) -> Album:
        album = Album(**fields)
        self._session.add(album)
        await self._session.flush()
        return album

    async def update(self, album: Album, **fields: object) -> Album:
        for field, value in fields.items():
            setattr(album, field, value)
        await self._session.flush()
        return album

    async def delete(self, album: Album) -> None:
        await self._session.delete(album)


async def get_album_repository(
    session: AsyncSession = Depends(get_session),
) -> AlbumRepository:
    return AlbumRepository(session)
