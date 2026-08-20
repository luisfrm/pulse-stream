import uuid

from fastapi import Depends
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.features.albums.models import Album
from app.features.songs.models import Song, SongCollaborator


def _song_load_options():
    """Carga lo que SongRead necesita (artista, álbum con artista,
    colaboradores) con selectin — sin N+1 en listas."""
    return (
        selectinload(Song.artist),
        selectinload(Song.album).selectinload(Album.artist),
        selectinload(Song.collaborators),
    )


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
        collaborator_id: uuid.UUID | None = None,
    ) -> list[Song]:
        query = select(Song).options(*_song_load_options())
        if search:
            query = query.where(Song.title.ilike(f"%{search}%"))
        if artist_id is not None:
            query = query.where(Song.artist_id == artist_id)
        if collaborator_id is not None:
            # Colaboraciones: el artista participa pero NO es el principal.
            # Sin `.distinct()`: la PK (song_id, artist_id) no duplica filas y
            # `distinct()` sobre `songs.*` rompe en Postgres (columna JSON).
            query = (
                query.join(SongCollaborator, SongCollaborator.song_id == Song.id)
                .where(
                    SongCollaborator.artist_id == collaborator_id,
                    Song.artist_id != collaborator_id,
                )
            )
        query = query.order_by(Song.created_at.desc())
        result = await self._session.execute(query.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def count(
        self,
        search: str | None = None,
        artist_id: uuid.UUID | None = None,
        collaborator_id: uuid.UUID | None = None,
    ) -> int:
        query = select(func.count()).select_from(Song)
        if search:
            query = query.where(Song.title.ilike(f"%{search}%"))
        if artist_id is not None:
            query = query.where(Song.artist_id == artist_id)
        if collaborator_id is not None:
            query = query.join(SongCollaborator, SongCollaborator.song_id == Song.id).where(
                SongCollaborator.artist_id == collaborator_id,
                Song.artist_id != collaborator_id,
            )
        result = await self._session.execute(query)
        return result.scalar_one()

    async def get(self, song_id: uuid.UUID) -> Song | None:
        result = await self._session.execute(
            select(Song).options(*_song_load_options()).where(Song.id == song_id)
        )
        return result.scalar_one_or_none()

    async def get_by_ids(self, song_ids: list[uuid.UUID]) -> dict[uuid.UUID, Song]:
        """Fetch de varias canciones con artista/álbum/colaboradores; dict id->Song.

        El orden del dict no importa — quien llama reordena contra su propio
        ranking (ver listens.service.recently_played).
        """
        if not song_ids:
            return {}
        result = await self._session.execute(
            select(Song).options(*_song_load_options()).where(Song.id.in_(song_ids))
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

    async def increment_plays(self, song_id: uuid.UUID) -> None:
        """+1 atómico al contador persistente de la canción (race-safe)."""
        await self._session.execute(
            update(Song).where(Song.id == song_id).values(play_count=Song.play_count + 1)
        )

    async def set_collaborators(
        self, song: Song, artist_ids: list[uuid.UUID]
    ) -> None:
        """Reemplaza los colaboradores de la canción (borra e inserta)."""
        await self._session.execute(
            SongCollaborator.__table__.delete().where(
                SongCollaborator.song_id == song.id
            )
        )
        for artist_id in artist_ids:
            self._session.add(SongCollaborator(song_id=song.id, artist_id=artist_id))

    async def rollback(self) -> None:
        """Rollback explícito de la sesión compartida (usado por ZipImportService
        cuando un archivo individual falla con error de DB)."""
        await self._session.rollback()


async def get_song_repository(
    session: AsyncSession = Depends(get_session),
) -> SongRepository:
    return SongRepository(session)
