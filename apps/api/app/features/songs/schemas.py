import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.features.artists.schemas import ArtistRead
from app.features.genres.schemas import SongGenre


class SongCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    # Se manda artist_id (artista existente) o artist_name (se crea inline).
    artist_id: uuid.UUID | None = None
    artist_name: str | None = Field(default=None, min_length=1, max_length=255)
    genres: list[SongGenre] = Field(default_factory=list)
    lyrics: str | None = None
    object_key: str = Field(min_length=1, max_length=1024)
    duration_seconds: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _require_artist(self) -> "SongCreate":
        if self.artist_id is None and not self.artist_name:
            raise ValueError("Se requiere artist_id o artist_name")
        return self


class SongUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    artist_id: uuid.UUID | None = None
    genres: list[SongGenre] | None = None
    lyrics: str | None = None
    duration_seconds: int | None = Field(default=None, ge=0)
    cover_key: str | None = None


class SongRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    artist: ArtistRead
    genres: list[SongGenre] = Field(default_factory=list)
    lyrics: str | None = None
    object_key: str
    cover_key: str | None = None
    duration_seconds: int | None = None
    created_at: datetime
    # Se leen desde las propiedades `Song.stream_url` / `Song.cover_url`.
    stream_url: str | None = None
    cover_url: str | None = None
