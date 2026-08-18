import uuid

from fastapi import Depends

from app.features.albums.repository import AlbumRepository, get_album_repository
from app.features.artists.repository import ArtistRepository, get_artist_repository
from app.features.songs.models import Song
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.songs.schemas import SongCreate, SongUpdate
from app.shared.exceptions import (
    AlbumNotFoundError,
    ArtistNotFoundError,
    SongNotFoundError,
)


class SongService:
    """Reglas de negocio de canciones. Orquesta song + artist + album repos."""

    def __init__(
        self,
        song_repository: SongRepository = Depends(get_song_repository),
        artist_repository: ArtistRepository = Depends(get_artist_repository),
        album_repository: AlbumRepository = Depends(get_album_repository),
    ) -> None:
        self._songs = song_repository
        self._artists = artist_repository
        self._albums = album_repository

    async def list_songs(
        self,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
        artist_id: uuid.UUID | None = None,
        collaborator_id: uuid.UUID | None = None,
    ) -> tuple[list[Song], int]:
        songs = await self._songs.list(
            offset=offset,
            limit=limit,
            search=search,
            artist_id=artist_id,
            collaborator_id=collaborator_id,
        )
        total = await self._songs.count(
            search=search, artist_id=artist_id, collaborator_id=collaborator_id
        )
        return songs, total

    async def get_song(self, song_id: uuid.UUID) -> Song:
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)
        return song

    async def _validate_artist(self, artist_id: uuid.UUID) -> None:
        artist = await self._artists.get(artist_id)
        if artist is None:
            raise ArtistNotFoundError(artist_id)

    async def _validate_album(self, album_id: uuid.UUID) -> None:
        album = await self._albums.get(album_id)
        if album is None:
            raise AlbumNotFoundError(album_id)

    async def _validate_collaborators(self, artist_ids: list[uuid.UUID]) -> None:
        for artist_id in artist_ids:
            await self._validate_artist(artist_id)

    async def create_song(self, payload: SongCreate) -> Song:
        """Crea la canción; si llega `artist_name` sin `artist_id`, crea el
        artista antes (todo en la misma transacción/sesión)."""
        artist_id = payload.artist_id
        if artist_id is not None:
            await self._validate_artist(artist_id)
        else:
            artist = await self._artists.get_by_name(payload.artist_name or "")
            if artist is None:
                artist = await self._artists.create(payload.artist_name or "")
            artist_id = artist.id

        if payload.album_id is not None:
            await self._validate_album(payload.album_id)
        await self._validate_collaborators(payload.collaborator_ids)

        genres = [g.value for g in payload.genres]
        song = await self._songs.create(
            title=payload.title,
            artist_id=artist_id,
            album_id=payload.album_id,
            genres=genres,
            lyrics=payload.lyrics,
            object_key=payload.object_key,
            cover_key=payload.cover_key,
            duration_seconds=payload.duration_seconds,
        )
        if payload.collaborator_ids:
            await self._songs.set_collaborators(song, payload.collaborator_ids)
        # Re-fetch con las relaciones cargadas (selectinload) para el schema
        return await self.get_song(song.id)

    async def update_song(self, song_id: uuid.UUID, payload: SongUpdate) -> Song:
        song = await self.get_song(song_id)
        data = payload.model_dump(exclude_unset=True)
        updates: dict[str, object] = {}

        if "artist_id" in data and data["artist_id"] is not None:
            await self._validate_artist(data["artist_id"])
            updates["artist_id"] = data["artist_id"]
        if "album_id" in data:
            if data["album_id"] is not None:
                await self._validate_album(data["album_id"])
            updates["album_id"] = data["album_id"]
        if "title" in data:
            updates["title"] = data["title"]
        if "genres" in data:
            updates["genres"] = [g.value for g in data["genres"]]
        if "lyrics" in data:
            updates["lyrics"] = data["lyrics"]
        if "duration_seconds" in data:
            updates["duration_seconds"] = data["duration_seconds"]
        if "cover_key" in data:
            updates["cover_key"] = data["cover_key"]

        if "collaborator_ids" in data:
            collaborator_ids = data["collaborator_ids"] or []
            await self._validate_collaborators(collaborator_ids)
            await self._songs.set_collaborators(song, collaborator_ids)

        updated = await self._songs.update(song, **updates)
        return await self.get_song(updated.id)

    async def delete_song(self, song_id: uuid.UUID) -> None:
        song = await self.get_song(song_id)
        await self._songs.delete(song)
