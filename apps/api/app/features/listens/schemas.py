import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ListenCreate(BaseModel):
    """Registro de una reproducción. El `user_id` lo da la sesión, no el body."""

    song_id: uuid.UUID


class ListenRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    song_id: uuid.UUID
    played_at: datetime