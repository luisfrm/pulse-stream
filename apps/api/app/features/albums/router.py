import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import ConfigDict, Field

from app.features.albums.models import Album
from app.features.albums.schemas import AlbumCreate, AlbumRead, AlbumUpdate
from app.features.albums.service import AlbumService
from app.features.auth.manager import require_admin
from app.features.songs.schemas import SongRead
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/albums", tags=["albums"])


class AlbumDetail(AlbumRead):
    """Álbum con sus canciones ordenadas.

    Vive acá (no en schemas.py) para evitar el ciclo de imports entre
    albums.schemas (AlbumRead) y songs.schemas (SongRead).
    """

    model_config = ConfigDict(from_attributes=True)

    songs: list[SongRead] = Field(default_factory=list)


@router.get("", response_model=Page[AlbumRead])
async def list_albums(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    q: str | None = Query(None, max_length=255, description="Búsqueda por título"),
    artist_id: uuid.UUID | None = Query(None, description="Filtrar por artista"),
    service: AlbumService = Depends(),
) -> Page[AlbumRead]:
    albums, total = await service.list_albums(
        offset=offset, limit=limit, search=q, artist_id=artist_id
    )
    return paginate(albums, total, offset, limit)


@router.get("/{album_id}", response_model=AlbumDetail)
async def get_album(
    album_id: uuid.UUID, service: AlbumService = Depends()
) -> Album:
    return await service.get_album(album_id)


@router.post("", response_model=AlbumDetail, status_code=status.HTTP_201_CREATED)
async def create_album(
    payload: AlbumCreate,
    service: AlbumService = Depends(),
    _: Album = Depends(require_admin),
) -> Album:
    return await service.create_album(payload)


@router.patch("/{album_id}", response_model=AlbumDetail)
async def update_album(
    album_id: uuid.UUID,
    payload: AlbumUpdate,
    service: AlbumService = Depends(),
    _: Album = Depends(require_admin),
) -> Album:
    return await service.update_album(album_id, payload)


@router.delete("/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_album(
    album_id: uuid.UUID,
    service: AlbumService = Depends(),
    _: Album = Depends(require_admin),
) -> None:
    await service.delete_album(album_id)
