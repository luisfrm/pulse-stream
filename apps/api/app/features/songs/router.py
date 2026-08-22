import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import require_admin
from app.features.listens.service import ListenService, get_listen_service
from app.features.songs.models import Song
from app.features.songs.schemas import SongCreate, SongRead, SongUpdate, SongWithPlays
from app.features.songs.service import SongService
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/songs", tags=["songs"])


@router.get("", response_model=Page[SongRead])
async def list_songs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    q: str | None = Query(None, max_length=255, description="Búsqueda por título"),
    artist_id: uuid.UUID | None = Query(None, description="Filtrar por artista"),
    collaborator_id: uuid.UUID | None = Query(
        None, description="Filtrar por artista colaborador (no principal)"
    ),
    album_id: uuid.UUID | None = Query(
        None, description="Filtrar por álbum (en orden de posición)"
    ),
    playlist_id: uuid.UUID | None = Query(
        None, description="Filtrar por playlist (en orden de posición)"
    ),
    service: SongService = Depends(),
) -> Page[SongRead]:
    songs, total = await service.list_songs(
        offset=offset,
        limit=limit,
        search=q,
        artist_id=artist_id,
        collaborator_id=collaborator_id,
        album_id=album_id,
        playlist_id=playlist_id,
    )
    return paginate(songs, total, offset, limit)


@router.get("/popular", response_model=list[SongWithPlays])
async def popular_songs(
    limit: int = Query(10, ge=1, le=50),
    days: int = Query(30, ge=1, le=365, description="Ventana móvil en días"),
    month: bool = Query(
        False, description="Usar el mes calendario actual (UTC) en vez de `days`"
    ),
    service: ListenService = Depends(get_listen_service),
) -> list[SongWithPlays]:
    """Top canciones por reproducciones en una ventana (días o mes actual)."""
    ranking = await service.popular_songs(limit=limit, days=days, month=month)
    items = []
    for song, plays in ranking:
        item = SongWithPlays.model_validate(song)
        item.play_count = plays
        items.append(item)
    return items


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
