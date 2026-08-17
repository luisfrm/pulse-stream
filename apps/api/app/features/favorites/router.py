import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import current_user
from app.features.favorites.service import FavoriteService, get_favorite_service
from app.features.songs.models import Song
from app.features.songs.schemas import SongRead
from app.features.users.models import User
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/me/favorites", tags=["favorites"])


@router.get("", response_model=Page[SongRead])
async def list_favorites(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> Page[SongRead]:
    """Canciones favoritas del usuario (más recientes primero)."""
    songs, total = await service.list_favorites(user, offset=offset, limit=limit)
    return paginate(songs, total, offset, limit)


@router.get("/ids", response_model=list[uuid.UUID])
async def favorite_ids(
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> list[uuid.UUID]:
    """IDs favoritos (para pintar corazones en listas grandes sin traer todo)."""
    return sorted(await service.favorite_ids(user))


@router.put("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(
    song_id: uuid.UUID,
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> None:
    await service.add_favorite(user, song_id)


@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    song_id: uuid.UUID,
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> None:
    await service.remove_favorite(user, song_id)
