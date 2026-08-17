import uuid

from fastapi import Depends

from app.features.albums.models import Album
from app.features.albums.repository import AlbumRepository, get_album_repository
from app.features.albums.schemas import AlbumCreate, AlbumUpdate
from app.features.artists.repository import ArtistRepository, get_artist_repository
from app.shared.exceptions import AlbumNotFoundError, ArtistNotFoundError


class AlbumService:
    """Reglas de negocio de álbumes. Nada de HTTP ni SQL directo."""

    def __init__(
        self,
        repository: AlbumRepository = Depends(get_album_repository),
        artist_repository: ArtistRepository = Depends(get_artist_repository),
    ) -> None:
        self._repository = repository
        self._artists = artist_repository

    async def list_albums(
        self,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
        artist_id: uuid.UUID | None = None,
    ) -> tuple[list[Album], int]:
        albums = await self._repository.list(
            offset=offset, limit=limit, search=search, artist_id=artist_id
        )
        total = await self._repository.count(search=search, artist_id=artist_id)
        return albums, total

    async def get_album(self, album_id: uuid.UUID) -> Album:
        album = await self._repository.get(album_id)
        if album is None:
            raise AlbumNotFoundError(album_id)
        return album

    async def create_album(self, payload: AlbumCreate) -> Album:
        artist = await self._artists.get(payload.artist_id)
        if artist is None:
            raise ArtistNotFoundError(payload.artist_id)
        album = await self._repository.create(
            title=payload.title, artist_id=payload.artist_id, cover_key=payload.cover_key
        )
        return await self.get_album(album.id)

    async def update_album(self, album_id: uuid.UUID, payload: AlbumUpdate) -> Album:
        album = await self.get_album(album_id)
        updates: dict[str, object] = {}
        if payload.title is not None:
            updates["title"] = payload.title
        if payload.artist_id is not None:
            artist = await self._artists.get(payload.artist_id)
            if artist is None:
                raise ArtistNotFoundError(payload.artist_id)
            updates["artist_id"] = payload.artist_id
        if payload.cover_key is not None:
            updates["cover_key"] = payload.cover_key
        updated = await self._repository.update(album, **updates)
        return await self.get_album(updated.id)

    async def delete_album(self, album_id: uuid.UUID) -> None:
        album = await self.get_album(album_id)
        await self._repository.delete(album)
