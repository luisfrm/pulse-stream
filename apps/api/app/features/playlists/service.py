import uuid

from fastapi import Depends

from app.features.playlists.models import Playlist
from app.features.playlists.repository import PlaylistRepository, get_playlist_repository
from app.features.playlists.schemas import PlaylistCreate, PlaylistUpdate
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.users.models import User
from app.shared.exceptions import (
    PlaylistForbiddenError,
    PlaylistNotFoundError,
    SongNotFoundError,
)


class PlaylistService:
    """Reglas de negocio de playlists. Nada de HTTP ni SQL directo."""

    def __init__(
        self,
        repository: PlaylistRepository = Depends(get_playlist_repository),
        song_repository: SongRepository = Depends(get_song_repository),
    ) -> None:
        self._repository = repository
        self._songs = song_repository

    async def list_for_user(self, user: User, *, public_only: bool = False) -> list[Playlist]:
        """Playlists del usuario; si `public_only`, solo las públicas (perfil)."""
        if public_only:
            all_public = await self._repository.list_public(limit=100)
            return [p for p in all_public if p.owner_id == user.id]
        return await self._repository.list_by_owner(user.id)

    async def list_public_community(
        self, offset: int = 0, limit: int = 50
    ) -> tuple[list[Playlist], int]:
        """Feed público: playlists públicas de TODOS los usuarios, nuevas primero."""
        playlists = await self._repository.list_public(offset=offset, limit=limit)
        total = await self._repository.count_public()
        return playlists, total

    async def get_playlist(self, playlist_id: uuid.UUID, user: User) -> Playlist:
        playlist = await self._repository.get(playlist_id)
        if playlist is None:
            raise PlaylistNotFoundError(playlist_id)
        # Regla: solo el dueño ve las privadas
        if not playlist.is_public and playlist.owner_id != user.id:
            raise PlaylistForbiddenError()
        return playlist

    async def create_playlist(self, user: User, payload: PlaylistCreate) -> Playlist:
        playlist = await self._repository.create(
            owner_id=user.id,
            name=payload.name,
            description=payload.description,
            is_public=payload.is_public,
        )
        # Re-fetch con relaciones cargadas (items/songs) para el schema
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def update_playlist(
        self, playlist_id: uuid.UUID, user: User, payload: PlaylistUpdate
    ) -> Playlist:
        playlist = await self._get_owned(playlist_id, user)
        updates = payload.model_dump(exclude_unset=True)
        return await self._repository.update(playlist, **updates)

    async def delete_playlist(self, playlist_id: uuid.UUID, user: User) -> None:
        playlist = await self._get_owned(playlist_id, user)
        await self._repository.delete(playlist)

    async def add_song(
        self, playlist_id: uuid.UUID, user: User, song_id: uuid.UUID
    ) -> Playlist:
        playlist = await self._get_owned(playlist_id, user)
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)
        await self._repository.add_song(playlist, song_id)
        # Re-fetch con las relaciones cargadas para la respuesta
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def remove_song(
        self, playlist_id: uuid.UUID, user: User, song_id: uuid.UUID
    ) -> Playlist:
        playlist = await self._get_owned(playlist_id, user)
        removed = await self._repository.remove_song(playlist, song_id)
        if not removed:
            raise SongNotFoundError(song_id)
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def _get_owned(self, playlist_id: uuid.UUID, user: User) -> Playlist:
        playlist = await self._repository.get(playlist_id)
        if playlist is None:
            raise PlaylistNotFoundError(playlist_id)
        if playlist.owner_id != user.id:
            raise PlaylistForbiddenError()
        return playlist


async def get_playlist_service(
    repository: PlaylistRepository = Depends(get_playlist_repository),
    song_repository: SongRepository = Depends(get_song_repository),
) -> PlaylistService:
    return PlaylistService(repository, song_repository)
