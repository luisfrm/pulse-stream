import uuid

from fastapi import Depends

from app.features.albums.models import Album
from app.features.albums.repository import AlbumRepository, get_album_repository
from app.features.favorites.repository import FavoriteRepository, get_favorite_repository
from app.features.playlists.models import Playlist
from app.features.playlists.repository import PlaylistRepository, get_playlist_repository
from app.features.songs.models import Song
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.users.models import User
from app.shared.exceptions import (
    AlbumNotFoundError,
    PlaylistForbiddenError,
    PlaylistNotFoundError,
    SongNotFoundError,
)


class FavoriteService:
    """Reglas de negocio de favoritos (canciones, playlists y álbumes).

    El like de una playlist/álbum es una acción de usuario normal: NUNCA muta
    el contenido de la playlist (las `system` solo las muta un admin) — solo
    marca el item como favorito del usuario.
    """

    def __init__(
        self,
        repository: FavoriteRepository = Depends(get_favorite_repository),
        song_repository: SongRepository = Depends(get_song_repository),
        playlist_repository: PlaylistRepository = Depends(get_playlist_repository),
        album_repository: AlbumRepository = Depends(get_album_repository),
    ) -> None:
        self._repository = repository
        self._songs = song_repository
        self._playlists = playlist_repository
        self._albums = album_repository

    # --- Canciones (existente) ---

    async def list_favorites(
        self, user: User, offset: int = 0, limit: int = 50
    ) -> tuple[list[Song], int]:
        songs = await self._repository.list_songs(user.id, offset=offset, limit=limit)
        total = await self._repository.count(user.id)
        return songs, total

    async def is_favorite(self, user: User, song_id: uuid.UUID) -> bool:
        ids = await self._repository.list_song_ids(user.id)
        return song_id in ids

    async def favorite_ids(self, user: User) -> set[uuid.UUID]:
        return await self._repository.list_song_ids(user.id)

    async def add_favorite(self, user: User, song_id: uuid.UUID) -> None:
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)
        await self._repository.add(user.id, song_id)

    async def remove_favorite(self, user: User, song_id: uuid.UUID) -> None:
        removed = await self._repository.remove(user.id, song_id)
        if not removed:
            raise SongNotFoundError(song_id)

    # --- Playlists ---

    async def list_favorite_playlists(
        self, user: User, offset: int = 0, limit: int = 50
    ) -> tuple[list[Playlist], int]:
        playlists = await self._repository.list_playlists(
            user.id, offset=offset, limit=limit
        )
        total = await self._repository.count_playlists(user.id)
        return playlists, total

    async def favorite_playlist_ids(self, user: User) -> set[uuid.UUID]:
        return await self._repository.list_playlist_ids(user.id)

    async def add_favorite_playlist(
        self, user: User, playlist_id: uuid.UUID
    ) -> None:
        """Like a una playlist (de usuario o del sistema).

        Regla de visibilidad: solo playlists que el usuario puede VER — las
        públicas de cualquiera o las propias (públicas o privadas). Las
        `system` son siempre públicas, así que cualquier usuario puede
        marcarlas como favoritas sin tocar su contenido.
        """
        playlist = await self._playlists.get(playlist_id)
        if playlist is None:
            raise PlaylistNotFoundError(playlist_id)
        if not playlist.is_public and playlist.owner_id != user.id:
            raise PlaylistForbiddenError()
        await self._repository.add_playlist(user.id, playlist_id)

    async def remove_favorite_playlist(
        self, user: User, playlist_id: uuid.UUID
    ) -> None:
        removed = await self._repository.remove_playlist(user.id, playlist_id)
        if not removed:
            raise PlaylistNotFoundError(playlist_id)

    # --- Álbumes ---

    async def list_favorite_albums(
        self, user: User, offset: int = 0, limit: int = 50
    ) -> tuple[list[Album], int]:
        albums = await self._repository.list_albums(
            user.id, offset=offset, limit=limit
        )
        total = await self._repository.count_albums(user.id)
        return albums, total

    async def favorite_album_ids(self, user: User) -> set[uuid.UUID]:
        return await self._repository.list_album_ids(user.id)

    async def add_favorite_album(self, user: User, album_id: uuid.UUID) -> None:
        album = await self._albums.get(album_id)
        if album is None:
            raise AlbumNotFoundError(album_id)
        await self._repository.add_album(user.id, album_id)

    async def remove_favorite_album(self, user: User, album_id: uuid.UUID) -> None:
        removed = await self._repository.remove_album(user.id, album_id)
        if not removed:
            raise AlbumNotFoundError(album_id)

    # --- Biblioteca consolidada ---

    async def library_ids(self, user: User) -> dict[str, set[uuid.UUID]]:
        """Los 3 sets de likes del usuario en una sola llamada.

        Para pintar corazones en la biblioteca sin traer las listas completas:
        `{"song_ids": [...], "album_ids": [...], "playlist_ids": [...]}`.
        """
        song_ids, album_ids, playlist_ids = await self._repository.library_ids(
            user.id
        )
        return {
            "song_ids": song_ids,
            "album_ids": album_ids,
            "playlist_ids": playlist_ids,
        }


async def get_favorite_service(
    repository: FavoriteRepository = Depends(get_favorite_repository),
    song_repository: SongRepository = Depends(get_song_repository),
    playlist_repository: PlaylistRepository = Depends(get_playlist_repository),
    album_repository: AlbumRepository = Depends(get_album_repository),
) -> FavoriteService:
    return FavoriteService(
        repository, song_repository, playlist_repository, album_repository
    )