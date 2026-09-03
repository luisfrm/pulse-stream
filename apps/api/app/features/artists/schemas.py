import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ArtistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    image_url: str | None = None
    # Cover subido a R2 (solo WebP con key del presign `covers/{uuid}.webp`).
    # El patrón rechaza el bypass por PATCH directo con una key arbitraria
    # (mismo patrón que AlbumCreate/AlbumUpdate — duplicado a propósito para
    # evitar un ciclo de imports albums↔artists).
    cover_key: str | None = Field(
        default=None, pattern=r"^covers/[0-9a-f-]+\.webp$"
    )


class ArtistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    image_url: str | None = None
    cover_key: str | None = Field(
        default=None, pattern=r"^covers/[0-9a-f-]+\.webp$"
    )


class ArtistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    image_url: str | None = None
    cover_key: str | None = None
    created_at: datetime
    # Se lee desde la propiedad `Artist.cover_url` (ver models.py).
    cover_url: str | None = None
