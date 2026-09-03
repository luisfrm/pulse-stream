import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.artists.schemas import ArtistRead


# Las keys las genera el presign (`covers/{uuid}.webp`): el patrón rechaza el
# bypass por PATCH directo con una key arbitraria (ej. .jpg o sin UUID).
# El mismo patrón vive duplicado en artists/playlists/users (escritura) a
# propósito: importar entre schemas de features crea ciclos (albums↔artists).
# Los schemas de lectura (AlbumRead, etc.) NO lo llevan: una fila legacy con
# key vieja debe seguir leyéndose sin 500.
COVER_KEY_PATTERN = r"^covers/[0-9a-f-]+\.webp$"


class AlbumCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    artist_id: uuid.UUID
    cover_key: str | None = Field(default=None, pattern=COVER_KEY_PATTERN)


class AlbumUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    artist_id: uuid.UUID | None = None
    cover_key: str | None = Field(default=None, pattern=COVER_KEY_PATTERN)


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
