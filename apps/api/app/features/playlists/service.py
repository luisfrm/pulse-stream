import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends

from app.features.listens.repository import ListenRepository, get_listen_repository
from app.features.playlists.models import Playlist
from app.features.playlists.repository import PlaylistRepository, get_playlist_repository
from app.features.playlists.schemas import (
    PlaylistCreate,
    PlaylistSystemCreate,
    PlaylistUpdate,
)
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
        listen_repository: ListenRepository = Depends(get_listen_repository),
    ) -> None:
        self._repository = repository
        self._songs = song_repository
        self._listens = listen_repository

    @staticmethod
    def _is_admin(user: User) -> bool:
        return user.role == "admin" or user.is_superuser

    async def list_for_user(self, user: User, *, public_only: bool = False) -> list[Playlist]:
        """Playlists del usuario; si `public_only`, solo las públicas (perfil)."""
        if public_only:
            all_public = await self._repository.list_public(limit=100)
            return [p for p in all_public if p.owner_id == user.id]
        return await self._repository.list_by_owner(user.id)

    async def list_public_community(
        self, offset: int = 0, limit: int = 50
    ) -> tuple[list[Playlist], int]:
        """Feed público: playlists públicas de TODOS (system primero)."""
        playlists = await self._repository.list_public(offset=offset, limit=limit)
        total = await self._repository.count_public()
        return playlists, total

    async def get_playlist(self, playlist_id: uuid.UUID, user: User) -> Playlist:
        playlist = await self._repository.get(playlist_id)
        if playlist is None:
            raise PlaylistNotFoundError(playlist_id)
        # Regla: solo el dueño ve las privadas (las system siempre son públicas)
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

    async def create_system_playlist(
        self, admin: User, payload: PlaylistSystemCreate
    ) -> Playlist:
        """Genera una playlist del sistema como snapshot de una query.

        - top_week: más reproducidas en los últimos 7 días.
        - top_month: más reproducidas en el mes calendario actual.
        - new: canciones recién agregadas.
        """
        if payload.query.value == "top_week":
            since = datetime.now(timezone.utc) - timedelta(days=7)
            ranking = await self._listens.top_song_ids(since=since, limit=30)
            song_ids = [song_id for song_id, _ in ranking]
        elif payload.query.value == "top_month":
            now = datetime.now(timezone.utc)
            since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            ranking = await self._listens.top_song_ids(since=since, limit=30)
            song_ids = [song_id for song_id, _ in ranking]
        else:  # "new"
            latest = await self._songs.list(offset=0, limit=30)
            song_ids = [song.id for song in latest]

        playlist = await self._repository.create(
            owner_id=admin.id,
            name=payload.name,
            description=payload.description,
            is_public=True,
        )
        playlist.kind = "system"
        for song_id in song_ids:
            await self._repository.add_song(playlist, song_id)
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def update_playlist(
        self, playlist_id: uuid.UUID, user: User, payload: PlaylistUpdate
    ) -> Playlist:
        playlist = await self._get_mutable(playlist_id, user)
        updates = payload.model_dump(exclude_unset=True)
        return await self._repository.update(playlist, **updates)

    async def delete_playlist(self, playlist_id: uuid.UUID, user: User) -> None:
        playlist = await self._get_mutable(playlist_id, user)
        await self._repository.delete(playlist)

    async def add_song(
        self, playlist_id: uuid.UUID, user: User, song_id: uuid.UUID
    ) -> Playlist:
        playlist = await self._get_mutable(playlist_id, user)
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)
        await self._repository.add_song(playlist, song_id)
        # Re-fetch con las relaciones cargadas para la respuesta
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def remove_song(
        self, playlist_id: uuid.UUID, user: User, song_id: uuid.UUID
    ) -> Playlist:
        playlist = await self._get_mutable(playlist_id, user)
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

    async def _get_mutable(self, playlist_id: uuid.UUID, user: User) -> Playlist:
        """Solo el dueño muta su playlist; las del sistema, solo un admin."""
        playlist = await self._get_owned(playlist_id, user)
        if playlist.kind == "system" and not self._is_admin(user):
            raise PlaylistForbiddenError()
        return playlist


async def get_playlist_service(
    repository: PlaylistRepository = Depends(get_playlist_repository),
    song_repository: SongRepository = Depends(get_song_repository),
    listen_repository: ListenRepository = Depends(get_listen_repository),
) -> PlaylistService:
    return PlaylistService(repository, song_repository, listen_repository)
