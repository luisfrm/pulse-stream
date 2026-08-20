from pydantic import BaseModel, Field

from app.features.songs.schemas import SongRead


class PresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str
    size: int = Field(ge=0)


class PresignResponse(BaseModel):
    url: str
    object_key: str
    content_type: str
    expires_in: int


class ZipImportIssue(BaseModel):
    """Un archivo del ZIP que no se importó (saltado o fallido), con el motivo."""

    name: str
    reason: str


class ZipImportResult(BaseModel):
    """Resultado del import por ZIP de un álbum completo."""

    imported: list[SongRead] = Field(default_factory=list)
    skipped: list[ZipImportIssue] = Field(default_factory=list)
    failed: list[ZipImportIssue] = Field(default_factory=list)
