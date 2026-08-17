import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ArtistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    image_url: str | None = None


class ArtistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    image_url: str | None = None


class ArtistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    image_url: str | None = None
    created_at: datetime
