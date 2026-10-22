import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import require_admin
from app.features.playlists.models import Playlist
from app.features.playlists.schemas import (
    PlaylistDetail,
    PlaylistRead,
    PlaylistSystemCreate,
)
from app.features.playlists.service import PlaylistService, get_playlist_service
from app.features.users.panel_models import PanelUser
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.post("/system", response_model=PlaylistDetail, status_code=status.HTTP_201_CREATED)
async def create_system_playlist(
    payload: PlaylistSystemCreate,
    service: PlaylistService = Depends(get_playlist_service),
    admin: PanelUser = Depends(require_admin),
) -> Playlist:
    """Genera una playlist del sistema (snapshot de una query) — admin only."""
    return await service.create_system_playlist(admin, payload)


@router.post(
    "/system/{playlist_id}/refresh", response_model=PlaylistDetail
)
async def refresh_system_playlist(
    playlist_id: uuid.UUID,
    service: PlaylistService = Depends(get_playlist_service),
    admin: PanelUser = Depends(require_admin),
) -> Playlist:
    """Regenera el snapshot de una playlist del sistema — admin only.

    Recalcula las canciones según la `query` que la generó (top_week,
    top_month o new) y reemplaza el contenido en la misma playlist.
    """
    return await service.refresh_system_playlist(admin, playlist_id)


@router.get("/public", response_model=Page[PlaylistRead])
async def list_public_playlists(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: PlaylistService = Depends(get_playlist_service),
) -> Page[PlaylistRead]:
    """Feed público: playlists públicas de toda la comunidad (system primero).

    Público (sin sesión): son contenido visible para cualquiera por diseño.
    `owner_email` es NULL para las playlists del sistema.
    """
    playlists, total = await service.list_public_community(offset=offset, limit=limit)
    return paginate(playlists, total, offset, limit)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_system_playlist(
    playlist_id: uuid.UUID,
    service: PlaylistService = Depends(get_playlist_service),
    admin: PanelUser = Depends(require_admin),
) -> None:
    """Borra una playlist del sistema — admin only.

    Solo `kind='system'`: las playlists de usuario pertenecen a la app. El
    panel conserva esta ruta (`DELETE /playlists/{id}`) para su botón de borrar.
    """
    await service.delete_system_playlist(admin, playlist_id)
