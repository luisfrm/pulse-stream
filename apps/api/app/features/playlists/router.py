import uuid

from fastapi import APIRouter, Depends, status

from app.features.auth.manager import current_user
from app.features.playlists.models import Playlist
from app.features.playlists.schemas import (
    PlaylistAddSong,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistRead,
    PlaylistUpdate,
)
from app.features.playlists.service import PlaylistService, get_playlist_service
from app.features.users.models import User

router = APIRouter(prefix="/playlists", tags=["playlists"])


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
