import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from app.features.songs.schemas import SongRead


class PlaylistKind(str, Enum):
    """Tipo de playlist (columna VARCHAR plana — regla de enums en Pydantic)."""

    USER = "user"
    SYSTEM = "system"


class PlaylistSystemQuery(str, Enum):
    """Fuente de datos de una playlist del sistema (se genera desde el panel)."""

    TOP_WEEK = "top_week"
    TOP_MONTH = "top_month"
    NEW = "new"


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    is_public: bool = False


class PlaylistSystemCreate(BaseModel):
    """Creación de una playlist del sistema (admin only).

    La playlist se genera como snapshot de una query: top de la semana,
    top del mes o canciones recién agregadas.
    """

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    query: PlaylistSystemQuery


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
    kind: PlaylistKind = PlaylistKind.USER
    name: str
    description: str | None = None
    is_public: bool = False
    cover_key: str | None = None
    cover_url: str | None = None
    song_count: int = 0
    # Query de snapshot (solo system): "top_week" | "top_month" | "new".
    # NULL en playlists de usuario o system creadas antes de la migración 0008.
    query: PlaylistSystemQuery | None = None
    # Autor (email del dueño) — se lee desde `Playlist.owner_email`.
    owner_email: str | None = None
    created_at: datetime


class PlaylistDetail(PlaylistRead):
    """Playlist con sus canciones (estilo Spotify: lista ordenada)."""

    songs: list[SongRead] = Field(default_factory=list)


class MyPlaylistRead(PlaylistRead):
    """Playlist del usuario para el PlaylistPicker (GET /me/playlists).

    Expone `song_ids` —ordenados por posición— para que el frontend muestre
    "Ya está en esta playlist" sin traer las canciones completas. Schema
    exclusivo de /me/playlists: NO reemplaza a `PlaylistRead`.
    """

    song_ids: list[uuid.UUID] = Field(default_factory=list)
