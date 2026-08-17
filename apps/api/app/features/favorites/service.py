import uuid

from fastapi import Depends

from app.features.favorites.repository import FavoriteRepository, get_favorite_repository
from app.features.songs.models import Song
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.users.models import User
from app.shared.exceptions import SongNotFoundError


class FavoriteService:
    """Reglas de negocio de favoritos. Nada de HTTP."""

    def __init__(
        self,
        repository: FavoriteRepository = Depends(get_favorite_repository),
        song_repository: SongRepository = Depends(get_song_repository),
    ) -> None:
        self._repository = repository
        self._songs = song_repository

    async def list_favorites(
        self, user: User, offset: int = 0, limit: int = 50
    ) -> tuple[list[Song], int]:
        songs = await self._repository.list_songs(user.id, offset=offset, limit=limit)
        total = await self._repository.count(user.id)
        return songs, total

    async def is_favorite(self, user: User, song_id: uuid.UUID) -> bool:
        ids = await self._repository.list_song_ids(user.id)
        return song_id in ids

    async def favorite_ids(self, user: User) -> set[uuid.UUID]:
        return await self._repository.list_song_ids(user.id)

    async def add_favorite(self, user: User, song_id: uuid.UUID) -> None:
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)
        await self._repository.add(user.id, song_id)

    async def remove_favorite(self, user: User, song_id: uuid.UUID) -> None:
        removed = await self._repository.remove(user.id, song_id)
        if not removed:
            raise SongNotFoundError(song_id)


async def get_favorite_service(
    repository: FavoriteRepository = Depends(get_favorite_repository),
    song_repository: SongRepository = Depends(get_song_repository),
) -> FavoriteService:
    return FavoriteService(repository, song_repository)
