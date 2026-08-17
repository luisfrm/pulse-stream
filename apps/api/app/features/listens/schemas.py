import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.songs.schemas import SongRead


class RecentlyPlayedSong(SongRead):
    """Canción del historial + cuántas veces la reprodujo el usuario."""

    user_play_count: int = 0


class ListenCreate(BaseModel):
    """Registro de una reproducción. El `user_id` lo da la sesión, no el body."""

    song_id: uuid.UUID


class ListenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    song_id: uuid.UUID
    played_at: datetime
