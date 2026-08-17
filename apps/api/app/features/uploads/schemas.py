from pydantic import BaseModel, Field


class PresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str
    size: int = Field(ge=0)


class PresignResponse(BaseModel):
    url: str
    object_key: str
    content_type: str
    expires_in: int
