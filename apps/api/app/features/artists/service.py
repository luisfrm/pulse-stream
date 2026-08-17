import uuid

from fastapi import Depends

from app.features.artists.models import Artist
from app.features.artists.repository import ArtistRepository, get_artist_repository
from app.features.artists.schemas import ArtistCreate, ArtistUpdate
from app.shared.exceptions import ArtistNameTakenError, ArtistNotFoundError


class ArtistService:
    """Reglas de negocio de artistas. Nada de HTTP ni SQL directo."""

    def __init__(
        self, repository: ArtistRepository = Depends(get_artist_repository)
    ) -> None:
        self._repository = repository

    async def list_artists(
        self, offset: int = 0, limit: int = 50, search: str | None = None
    ) -> tuple[list[Artist], int]:
        artists = await self._repository.list(offset=offset, limit=limit, search=search)
        total = await self._repository.count(search=search)
        return artists, total

    async def get_artist(self, artist_id: uuid.UUID) -> Artist:
        artist = await self._repository.get(artist_id)
        if artist is None:
            raise ArtistNotFoundError(artist_id)
        return artist

    async def create_artist(self, payload: ArtistCreate) -> Artist:
        existing = await self._repository.get_by_name(payload.name)
        if existing is not None:
            raise ArtistNameTakenError(payload.name)
        return await self._repository.create(
            payload.name, payload.image_url, payload.cover_key
        )

    async def get_or_create_by_name(self, name: str) -> Artist:
        """Usado por songs cuando llega `artist_name` inline (Fase 1)."""
        artist = await self._repository.get_by_name(name)
        if artist is not None:
            return artist
        return await self._repository.create(name)

    async def update_artist(
        self, artist_id: uuid.UUID, payload: ArtistUpdate
    ) -> Artist:
        artist = await self.get_artist(artist_id)
        if payload.name is not None and payload.name != artist.name:
            existing = await self._repository.get_by_name(payload.name)
            if existing is not None and existing.id != artist.id:
                raise ArtistNameTakenError(payload.name)
        updates = payload.model_dump(exclude_unset=True)
        return await self._repository.update(artist, **updates)

    async def delete_artist(self, artist_id: uuid.UUID) -> None:
        artist = await self.get_artist(artist_id)
        await self._repository.delete(artist)
