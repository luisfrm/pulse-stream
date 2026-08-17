from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import current_user
from app.features.listens.schemas import ListenCreate, ListenRead
from app.features.listens.service import ListenService, get_listen_service
from app.features.songs.schemas import SongRead
from app.features.users.models import User
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/me", tags=["listens"])


@router.post("/listens", response_model=ListenRead, status_code=status.HTTP_201_CREATED)
async def record_play(
    payload: ListenCreate,
    service: ListenService = Depends(get_listen_service),
    user: User = Depends(current_user),
) -> ListenRead:
    """Registra una reproducción (play). Idempotente dentro de ~30 s por canción."""
    listen = await service.record_play(user, payload.song_id)
    return ListenRead(
        id=listen.id, song_id=listen.song_id, played_at=listen.played_at
    )


@router.get("/recently-played", response_model=Page[SongRead])
async def recently_played(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: ListenService = Depends(get_listen_service),
    user: User = Depends(current_user),
) -> Page[SongRead]:
    """Canciones reproducidas por el usuario (sin duplicar), último play primero."""
    songs, total = await service.recently_played(user, offset=offset, limit=limit)
    return paginate(songs, total, offset, limit)