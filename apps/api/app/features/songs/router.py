import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import require_admin
from app.features.songs.models import Song
from app.features.songs.schemas import SongCreate, SongRead, SongUpdate
from app.features.songs.service import SongService
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/songs", tags=["songs"])


@router.get("", response_model=Page[SongRead])
async def list_songs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    q: str | None = Query(None, max_length=255, description="Búsqueda por título"),
    artist_id: uuid.UUID | None = Query(None, description="Filtrar por artista"),
    service: SongService = Depends(),
) -> Page[SongRead]:
    songs, total = await service.list_songs(
        offset=offset, limit=limit, search=q, artist_id=artist_id
    )
    return paginate(songs, total, offset, limit)


@router.get("/{song_id}", response_model=SongRead)
async def get_song(
    song_id: uuid.UUID, service: SongService = Depends()
) -> Song:
    return await service.get_song(song_id)


@router.post("", response_model=SongRead, status_code=status.HTTP_201_CREATED)
async def create_song(
    payload: SongCreate,
    service: SongService = Depends(),
    _: Song = Depends(require_admin),
) -> Song:
    return await service.create_song(payload)


@router.patch("/{song_id}", response_model=SongRead)
async def update_song(
    song_id: uuid.UUID,
    payload: SongUpdate,
    service: SongService = Depends(),
    _: Song = Depends(require_admin),
) -> Song:
    return await service.update_song(song_id, payload)


@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_song(
    song_id: uuid.UUID,
    service: SongService = Depends(),
    _: Song = Depends(require_admin),
) -> None:
    await service.delete_song(song_id)
