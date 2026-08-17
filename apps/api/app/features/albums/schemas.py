import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.artists.schemas import ArtistRead


class AlbumCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    artist_id: uuid.UUID
    cover_key: str | None = None


class AlbumUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    artist_id: uuid.UUID | None = None
    cover_key: str | None = None


class AlbumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    artist: ArtistRead
    cover_key: str | None = None
    # Se lee desde la propiedad `Album.cover_url`.
    cover_url: str | None = None
    song_count: int = 0
    created_at: datetime
