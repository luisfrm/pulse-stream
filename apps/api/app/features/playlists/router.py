import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.auth.manager import current_user, require_admin
from app.features.playlists.models import Playlist
from app.features.playlists.schemas import (
    PlaylistAddSong,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistRead,
    PlaylistSystemCreate,
    PlaylistUpdate,
)
from app.features.playlists.service import PlaylistService, get_playlist_service
from app.features.users.models import User
from app.shared.pagination import Page, paginate

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.post("/system", response_model=PlaylistDetail, status_code=status.HTTP_201_CREATED)
async def create_system_playlist(
    payload: PlaylistSystemCreate,
    service: PlaylistService = Depends(get_playlist_service),
    admin: User = Depends(require_admin),
) -> Playlist:
    """Genera una playlist del sistema (snapshot de una query) — admin only."""
    return await service.create_system_playlist(admin, payload)


@router.post(
    "/system/{playlist_id}/refresh", response_model=PlaylistDetail
)
async def refresh_system_playlist(
    playlist_id: uuid.UUID,
    service: PlaylistService = Depends(get_playlist_service),
    admin: User = Depends(require_admin),
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
    """Feed público: playlists públicas de toda la comunidad (nuevas primero).

    Público (sin sesión): son contenido visible para cualquiera por diseño.
    """
    playlists, total = await service.list_public_community(offset=offset, limit=limit)
    return paginate(playlists, total, offset, limit)


@router.get("", response_model=list[PlaylistRead])
async def list_playlists(
    mine: bool = True,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> list[Playlist]:
    """Playlists del usuario actual (o las públicas del mismo perfil)."""
    return await service.list_for_user(user, public_only=not mine)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
async def get_playlist(
    playlist_id: uuid.UUID,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> Playlist:
    """Detalle con canciones ordenadas (solo dueño o playlist pública)."""
    return await service.get_playlist(playlist_id, user)


@router.post("", response_model=PlaylistDetail, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    payload: PlaylistCreate,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> Playlist:
    return await service.create_playlist(user, payload)


@router.patch("/{playlist_id}", response_model=PlaylistDetail)
async def update_playlist(
    playlist_id: uuid.UUID,
    payload: PlaylistUpdate,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> Playlist:
    return await service.update_playlist(playlist_id, user, payload)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: uuid.UUID,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> None:
    await service.delete_playlist(playlist_id, user)


@router.post("/{playlist_id}/songs", response_model=PlaylistDetail)
async def add_song_to_playlist(
    playlist_id: uuid.UUID,
    payload: PlaylistAddSong,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> Playlist:
    return await service.add_song(playlist_id, user, payload.song_id)


@router.delete("/{playlist_id}/songs/{song_id}", response_model=PlaylistDetail)
async def remove_song_from_playlist(
    playlist_id: uuid.UUID,
    song_id: uuid.UUID,
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> Playlist:
    return await service.remove_song(playlist_id, user, song_id)


# Router bajo /me: alias canónico de "mis playlists" para el "+" de agregar a
# playlist desde cualquier card y para la biblioteca (mismo namespace que
# /me/favorites y /me/listens).
me_router = APIRouter(prefix="/me", tags=["playlists"])


@me_router.get("/playlists", response_model=list[PlaylistRead])
async def list_my_playlists(
    service: PlaylistService = Depends(get_playlist_service),
    user: User = Depends(current_user),
) -> list[Playlist]:
    """Playlists del usuario actual (para el menú "agregar a playlist")."""
    return await service.list_for_user(user)
