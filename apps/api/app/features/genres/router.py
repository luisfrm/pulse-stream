from fastapi import APIRouter

from app.features.genres.schemas import SongGenre

router = APIRouter(prefix="/genres", tags=["genres"])


@router.get("", response_model=list[str])
async def list_genres() -> list[str]:
    """Lista los géneros permitidos (mismo set que valida el backend)."""
    return [genre.value for genre in SongGenre]
