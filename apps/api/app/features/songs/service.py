import uuid

from fastapi import Depends

from app.features.artists.repository import ArtistRepository, get_artist_repository
from app.features.songs.models import Song
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.songs.schemas import SongCreate, SongUpdate
from app.shared.exceptions import ArtistNotFoundError, SongNotFoundError


class SongService:
    """Reglas de negocio de canciones. Orquesta song + artist repository."""

    def __init__(
        self,
        song_repository: SongRepository = Depends(get_song_repository),
        artist_repository: ArtistRepository = Depends(get_artist_repository),
    ) -> None:
        self._songs = song_repository
        self._artists = artist_repository

    async def list_songs(
        self,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
        artist_id: uuid.UUID | None = None,
    ) -> tuple[list[Song], int]:
        songs = await self._songs.list(
            offset=offset, limit=limit, search=search, artist_id=artist_id
        )
        total = await self._songs.count(search=search, artist_id=artist_id)
        return songs, total

    async def get_song(self, song_id: uuid.UUID) -> Song:
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)
        return song

    async def create_song(self, payload: SongCreate) -> Song:
        """Crea la canción; si llega `artist_name` sin `artist_id`, crea el
        artista antes (todo en la misma transacción/sesión)."""
        artist_id = payload.artist_id
        if artist_id is not None:
            artist = await self._artists.get(artist_id)
            if artist is None:
                raise ArtistNotFoundError(artist_id)
        else:
            artist = await self._artists.get_by_name(payload.artist_name or "")
            if artist is None:
                artist = await self._artists.create(payload.artist_name or "")
            artist_id = artist.id

        genres = [g.value for g in payload.genres]
        song = await self._songs.create(
            title=payload.title,
            artist_id=artist_id,
            genres=genres,
            lyrics=payload.lyrics,
            object_key=payload.object_key,
            duration_seconds=payload.duration_seconds,
        )
        # Re-fetch con la relación artist cargada (selectinload) para el schema
        return await self.get_song(song.id)

    async def update_song(
        self, song_id: uuid.UUID, payload: SongUpdate
    ) -> Song:
        song = await self.get_song(song_id)
        updates: dict[str, object] = {}
        if payload.title is not None:
            updates["title"] = payload.title
        if payload.artist_id is not None:
            artist = await self._artists.get(payload.artist_id)
            if artist is None:
                raise ArtistNotFoundError(payload.artist_id)
            updates["artist_id"] = payload.artist_id
        if payload.genres is not None:
            updates["genres"] = [g.value for g in payload.genres]
        if payload.lyrics is not None:
            updates["lyrics"] = payload.lyrics
        if payload.duration_seconds is not None:
            updates["duration_seconds"] = payload.duration_seconds
        updated = await self._songs.update(song, **updates)
        return await self.get_song(updated.id)

    async def delete_song(self, song_id: uuid.UUID) -> None:
        song = await self.get_song(song_id)
        await self._songs.delete(song)
