import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.artists.models import Artist
from app.features.artists.schemas import ArtistCreate, ArtistRead, ArtistUpdate
from app.features.artists.service import ArtistService
from app.features.auth.manager import require_admin
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/artists", tags=["artists"])


@router.get("", response_model=Page[ArtistRead])
async def list_artists(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    q: str | None = Query(None, max_length=255, description="Búsqueda por nombre"),
    service: ArtistService = Depends(),
) -> Page[ArtistRead]:
    artists, total = await service.list_artists(offset=offset, limit=limit, search=q)
    return paginate(artists, total, offset, limit)


@router.get("/{artist_id}", response_model=ArtistRead)
async def get_artist(
    artist_id: uuid.UUID, service: ArtistService = Depends()
) -> Artist:
    return await service.get_artist(artist_id)


@router.post(
    "", response_model=ArtistRead, status_code=status.HTTP_201_CREATED
)
async def create_artist(
    payload: ArtistCreate,
    service: ArtistService = Depends(),
    _: Artist = Depends(require_admin),
) -> Artist:
    return await service.create_artist(payload)


@router.patch("/{artist_id}", response_model=ArtistRead)
async def update_artist(
    artist_id: uuid.UUID,
    payload: ArtistUpdate,
    service: ArtistService = Depends(),
    _: Artist = Depends(require_admin),
) -> Artist:
    return await service.update_artist(artist_id, payload)


@router.delete("/{artist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_artist(
    artist_id: uuid.UUID,
    service: ArtistService = Depends(),
    _: Artist = Depends(require_admin),
) -> None:
    await service.delete_artist(artist_id)
