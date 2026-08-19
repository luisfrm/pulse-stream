import uuid

from fastapi import APIRouter, Depends, Query, status

from app.features.albums.models import Album
from app.features.albums.schemas import AlbumRead
from app.features.auth.manager import current_user
from app.features.favorites.service import FavoriteService, get_favorite_service
from app.features.playlists.models import Playlist
from app.features.playlists.schemas import PlaylistRead
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
    """IDs de canciones favoritas (para pintar corazones sin traer todo)."""
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


# --- Playlists favoritas (de usuario y del sistema) ---
# Las rutas específicas (`/playlists/ids`) van ANTES de las parametrizadas
# (`/playlists/{playlist_id}`) para que FastAPI no las capture como UUID.

@router.get("/playlists", response_model=Page[PlaylistRead])
async def list_favorite_playlists(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> Page[PlaylistRead]:
    """Playlists favoritas del usuario (de usuario y del sistema), más recientes primero."""
    playlists, total = await service.list_favorite_playlists(
        user, offset=offset, limit=limit
    )
    return paginate(playlists, total, offset, limit)


@router.get("/playlists/ids", response_model=list[uuid.UUID])
async def favorite_playlist_ids(
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> list[uuid.UUID]:
    """IDs de playlists favoritas (para pintar corazones sin traer todo)."""
    return sorted(await service.favorite_playlist_ids(user))


@router.put("/playlists/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite_playlist(
    playlist_id: uuid.UUID,
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> None:
    """Like a una playlist (de usuario o del sistema).

    Acción de usuario normal: NO muta el contenido de la playlist (las
    `system` solo las muta un admin), solo la marca como favorita.
    """
    await service.add_favorite_playlist(user, playlist_id)


@router.delete("/playlists/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite_playlist(
    playlist_id: uuid.UUID,
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> None:
    await service.remove_favorite_playlist(user, playlist_id)


# --- Álbumes favoritos ---

@router.get("/albums", response_model=Page[AlbumRead])
async def list_favorite_albums(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> Page[AlbumRead]:
    """Álbumes favoritos del usuario (más recientes primero)."""
    albums, total = await service.list_favorite_albums(
        user, offset=offset, limit=limit
    )
    return paginate(albums, total, offset, limit)


@router.get("/albums/ids", response_model=list[uuid.UUID])
async def favorite_album_ids(
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> list[uuid.UUID]:
    """IDs de álbumes favoritos (para pintar corazones sin traer todo)."""
    return sorted(await service.favorite_album_ids(user))


@router.put("/albums/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite_album(
    album_id: uuid.UUID,
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> None:
    await service.add_favorite_album(user, album_id)


@router.delete("/albums/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite_album(
    album_id: uuid.UUID,
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> None:
    await service.remove_favorite_album(user, album_id)


# --- Biblioteca consolidada ---

library_router = APIRouter(prefix="/me/library", tags=["library"])


@library_router.get("/ids", response_model=dict[str, list[uuid.UUID]])
async def library_ids(
    service: FavoriteService = Depends(get_favorite_service),
    user: User = Depends(current_user),
) -> dict[str, list[uuid.UUID]]:
    """Los 3 sets de likes del usuario en una sola llamada.

    `{"song_ids": [...], "album_ids": [...], "playlist_ids": [...]}` — para
    pintar corazones en la biblioteca sin traer las listas completas.
    """
    ids = await service.library_ids(user)
    return {
        "song_ids": sorted(ids["song_ids"]),
        "album_ids": sorted(ids["album_ids"]),
        "playlist_ids": sorted(ids["playlist_ids"]),
    }