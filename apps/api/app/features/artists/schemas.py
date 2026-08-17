import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ArtistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    image_url: str | None = None
    # Cover subido a R2 (jpg <= 512KB). Se asigna con el object_key del presign.
    cover_key: str | None = None


class ArtistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    image_url: str | None = None
    cover_key: str | None = None


class ArtistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    image_url: str | None = None
    cover_key: str | None = None
    created_at: datetime
    # Se lee desde la propiedad `Artist.cover_url` (ver models.py).
    cover_url: str | None = None
