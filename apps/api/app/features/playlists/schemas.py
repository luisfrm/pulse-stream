import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.songs.schemas import SongRead


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    is_public: bool = False


class PlaylistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_public: bool | None = None
    cover_key: str | None = None


class PlaylistAddSong(BaseModel):
    song_id: uuid.UUID


class PlaylistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    is_public: bool = False
    cover_key: str | None = None
    cover_url: str | None = None
    song_count: int = 0
    # Autor (email del dueño) — se lee desde `Playlist.owner_email`.
    owner_email: str | None = None
    created_at: datetime


class PlaylistDetail(PlaylistRead):
    """Playlist con sus canciones (estilo Spotify: lista ordenada)."""

    songs: list[SongRead] = Field(default_factory=list)
