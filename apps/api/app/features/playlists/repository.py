import uuid

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.features.playlists.models import Playlist, PlaylistSong
from app.features.songs.models import Song


class PlaylistRepository:
    """Únicamente queries SQLAlchemy de playlists."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _with_songs(self, query):
        # owner + items -> PlaylistSong -> Song -> Artist (para el detalle/listado)
        # owner se carga SIEMPRE: `owner_email` se lee como propiedad del modelo.
        return query.options(
            selectinload(Playlist.owner),
            selectinload(Playlist.items)
            .selectinload(PlaylistSong.song)
            .selectinload(Song.artist),
        )

    async def list_by_owner(self, owner_id: uuid.UUID) -> list[Playlist]:
        result = await self._session.execute(
            self._with_songs(select(Playlist))
            .where(Playlist.owner_id == owner_id)
            .order_by(Playlist.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_public(self, offset: int = 0, limit: int = 50) -> list[Playlist]:
        result = await self._session.execute(
            select(Playlist)
            .options(
                selectinload(Playlist.owner),
                # items (sin canciones) alcanza para `song_count` del feed
                selectinload(Playlist.items),
            )
            .where(Playlist.is_public.is_(True))
            # Las del sistema primero (curated), después nuevas por fecha.
            .order_by(Playlist.kind != "system", Playlist.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_public(self) -> int:
        result = await self._session.execute(
            select(Playlist.id).where(Playlist.is_public.is_(True))
        )
        return len(result.scalars().all())

    async def get(self, playlist_id: uuid.UUID) -> Playlist | None:
        result = await self._session.execute(
            # populate_existing: recarga las relaciones aunque la instancia ya
            # esté en el identity map (mutaciones previas en la misma sesión)
            self._with_songs(select(Playlist))
            .where(Playlist.id == playlist_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def create(
        self, owner_id: uuid.UUID, name: str, description: str | None, is_public: bool
    ) -> Playlist:
        playlist = Playlist(
            owner_id=owner_id,
            name=name,
            description=description,
            is_public=is_public,
        )
        self._session.add(playlist)
        await self._session.flush()
        return playlist

    async def update(self, playlist: Playlist, **fields: object) -> Playlist:
        for field, value in fields.items():
            setattr(playlist, field, value)
        await self._session.flush()
        return playlist

    async def delete(self, playlist: Playlist) -> None:
        await self._session.delete(playlist)

    async def add_song(self, playlist: Playlist, song_id: uuid.UUID) -> None:
        """Agrega la canción al final; no-op si ya está en la playlist.

        No lee `playlist.items` (evita lazy-load en contexto async); la
        existencia y la posición se resuelven con counts.
        """
        exists = await self._session.execute(
            select(PlaylistSong.song_id).where(
                PlaylistSong.playlist_id == playlist.id,
                PlaylistSong.song_id == song_id,
            )
        )
        if exists.scalar_one_or_none() is not None:
            return
        position = await self._session.execute(
            select(func.count())
            .select_from(PlaylistSong)
            .where(PlaylistSong.playlist_id == playlist.id)
        )
        self._session.add(
            PlaylistSong(
                playlist_id=playlist.id,
                song_id=song_id,
                position=position.scalar_one(),
            )
        )
        await self._session.flush()

    async def remove_song(self, playlist: Playlist, song_id: uuid.UUID) -> bool:
        """Quita la canción y renumera las posiciones. Devuelve True si existía."""
        item = next((i for i in playlist.items if i.song_id == song_id), None)
        if item is None:
            return False
        await self._session.delete(item)
        await self._session.flush()
        # Renumerar posiciones restantes
        remaining = sorted(
            (i for i in playlist.items if i.song_id != song_id),
            key=lambda i: i.position,
        )
        for index, i in enumerate(remaining):
            i.position = index
        await self._session.flush()
        return True


async def get_playlist_repository(
    session: AsyncSession = Depends(get_session),
) -> PlaylistRepository:
    return PlaylistRepository(session)
