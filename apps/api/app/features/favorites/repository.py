import uuid

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_session
from app.features.albums.models import Album
from app.features.favorites.models import (
    UserFavorite,
    UserFavoriteAlbum,
    UserFavoritePlaylist,
)
from app.features.playlists.models import Playlist
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
            .options(selectinload(Song.artist), selectinload(Song.album))
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

    # --- Playlists (like de playlists de usuario y del sistema) ---

    async def list_playlist_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        result = await self._session.execute(
            select(UserFavoritePlaylist.playlist_id).where(
                UserFavoritePlaylist.user_id == user_id
            )
        )
        return set(result.scalars().all())

    async def list_playlists(
        self, user_id: uuid.UUID, offset: int = 0, limit: int = 50
    ) -> list[Playlist]:
        """Playlists favoritas ordenadas por fecha de like (más recientes primero).

        Carga owner + items: `PlaylistRead` necesita `owner_email` y `song_count`.
        """
        result = await self._session.execute(
            select(Playlist)
            .join(
                UserFavoritePlaylist,
                UserFavoritePlaylist.playlist_id == Playlist.id,
            )
            .options(
                selectinload(Playlist.owner),
                selectinload(Playlist.items),
            )
            .where(UserFavoritePlaylist.user_id == user_id)
            .order_by(UserFavoritePlaylist.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_playlists(self, user_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(UserFavoritePlaylist.playlist_id).where(
                UserFavoritePlaylist.user_id == user_id
            )
        )
        return len(result.scalars().all())

    async def add_playlist(self, user_id: uuid.UUID, playlist_id: uuid.UUID) -> None:
        """Agrega el like (no-op si ya existía)."""
        existing = await self._session.get(
            UserFavoritePlaylist, (user_id, playlist_id)
        )
        if existing is None:
            self._session.add(
                UserFavoritePlaylist(user_id=user_id, playlist_id=playlist_id)
            )
            await self._session.flush()

    async def remove_playlist(self, user_id: uuid.UUID, playlist_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(UserFavoritePlaylist).where(
                UserFavoritePlaylist.user_id == user_id,
                UserFavoritePlaylist.playlist_id == playlist_id,
            )
        )
        await self._session.flush()
        return result.rowcount > 0

    # --- Álbumes (like de álbumes) ---

    async def list_album_ids(self, user_id: uuid.UUID) -> set[uuid.UUID]:
        result = await self._session.execute(
            select(UserFavoriteAlbum.album_id).where(
                UserFavoriteAlbum.user_id == user_id
            )
        )
        return set(result.scalars().all())

    async def list_albums(
        self, user_id: uuid.UUID, offset: int = 0, limit: int = 50
    ) -> list[Album]:
        """Álbumes favoritos ordenados por fecha de like (más recientes primero).

        `song_count` se setea como atributo transiente (mismo patrón que
        `AlbumRepository.list`): LEFT JOIN agrupado para no hacer N+1.
        """
        song_count = func.count(Song.id).label("song_count")
        result = await self._session.execute(
            select(Album, song_count)
            .join(UserFavoriteAlbum, UserFavoriteAlbum.album_id == Album.id)
            .outerjoin(Song, Song.album_id == Album.id)
            .options(selectinload(Album.artist))
            .where(UserFavoriteAlbum.user_id == user_id)
            .group_by(Album.id, UserFavoriteAlbum.created_at)
            .order_by(UserFavoriteAlbum.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        albums: list[Album] = []
        for album, count in result.all():
            album.song_count = count  # type: ignore[attr-defined]
            albums.append(album)
        return albums

    async def count_albums(self, user_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(UserFavoriteAlbum.album_id).where(
                UserFavoriteAlbum.user_id == user_id
            )
        )
        return len(result.scalars().all())

    async def add_album(self, user_id: uuid.UUID, album_id: uuid.UUID) -> None:
        """Agrega el like (no-op si ya existía)."""
        existing = await self._session.get(UserFavoriteAlbum, (user_id, album_id))
        if existing is None:
            self._session.add(UserFavoriteAlbum(user_id=user_id, album_id=album_id))
            await self._session.flush()

    async def remove_album(self, user_id: uuid.UUID, album_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(UserFavoriteAlbum).where(
                UserFavoriteAlbum.user_id == user_id,
                UserFavoriteAlbum.album_id == album_id,
            )
        )
        await self._session.flush()
        return result.rowcount > 0

    # --- Biblioteca consolidada ---

    async def library_ids(
        self, user_id: uuid.UUID
    ) -> tuple[set[uuid.UUID], set[uuid.UUID], set[uuid.UUID]]:
        """Los 3 sets de likes en 3 queries (una por tabla): (songs, albums, playlists)."""
        song_result = await self._session.execute(
            select(UserFavorite.song_id).where(UserFavorite.user_id == user_id)
        )
        album_result = await self._session.execute(
            select(UserFavoriteAlbum.album_id).where(
                UserFavoriteAlbum.user_id == user_id
            )
        )
        playlist_result = await self._session.execute(
            select(UserFavoritePlaylist.playlist_id).where(
                UserFavoritePlaylist.user_id == user_id
            )
        )
        return (
            set(song_result.scalars().all()),
            set(album_result.scalars().all()),
            set(playlist_result.scalars().all()),
        )


async def get_favorite_repository(
    session: AsyncSession = Depends(get_session),
) -> FavoriteRepository:
    return FavoriteRepository(session)
