import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends

from app.features.listens.repository import ListenRepository, get_listen_repository
from app.features.playlists.models import Playlist
from app.features.playlists.repository import PlaylistRepository, get_playlist_repository
from app.features.playlists.schemas import (
    PlaylistSystemCreate,
    PlaylistSystemQuery,
)
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.users.models import SYSTEM_USER_ID
from app.features.users.panel_models import PanelUser
from app.shared.exceptions import (
    PlaylistForbiddenError,
    PlaylistNotRefreshableError,
    PlaylistNotFoundError,
)

# Tamaño de los snapshots de playlists del sistema (top_week/top_month/new).
_SYSTEM_SNAPSHOT_LIMIT = 30


class PlaylistService:
    """Reglas de negocio de playlists del panel. Nada de HTTP ni SQL directo."""

    def __init__(
        self,
        repository: PlaylistRepository = Depends(get_playlist_repository),
        song_repository: SongRepository = Depends(get_song_repository),
        listen_repository: ListenRepository = Depends(get_listen_repository),
    ) -> None:
        self._repository = repository
        self._songs = song_repository
        self._listens = listen_repository

    @staticmethod
    def _is_admin(user: PanelUser) -> bool:
        # `is_superuser` no autoriza: solo `role="admin"` (ver require_admin).
        return user.role == "admin"

    async def list_public_community(
        self, offset: int = 0, limit: int = 50
    ) -> tuple[list[Playlist], int]:
        """Feed público: playlists públicas de TODOS (system primero)."""
        playlists = await self._repository.list_public(offset=offset, limit=limit)
        total = await self._repository.count_public()
        return playlists, total

    async def create_system_playlist(
        self, admin: PanelUser, payload: PlaylistSystemCreate
    ) -> Playlist:
        """Genera una playlist del sistema como snapshot de una query.

        - top_week: más reproducidas en los últimos 7 días.
        - top_month: más reproducidas en el mes calendario actual (UTC).
        - new: canciones recién agregadas (created_at desc).

        La playlist pertenece al usuario fijo del sistema (NO al admin que la
        crea): así el admin no es dueño de datos de la app y el feed no expone
        un email personal. Guarda su `query` para poder regenerarse después.
        """
        song_ids = await self._snapshot_song_ids(payload.query)
        playlist = await self._repository.create(
            owner_id=SYSTEM_USER_ID,
            name=payload.name,
            description=payload.description,
            is_public=True,
            kind="system",
            query=payload.query.value,
        )
        await self._repository.replace_songs(playlist, song_ids)
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def refresh_system_playlist(
        self, admin: PanelUser, playlist_id: uuid.UUID
    ) -> Playlist:
        """Regenera el snapshot de una playlist del sistema (admin only).

        Recalcula las canciones según la `query` que la generó y reemplaza el
        contenido (misma playlist, mismo id — no se duplica).
        """
        playlist = await self._get_mutable(playlist_id, admin)
        if playlist.kind != "system":
            raise PlaylistNotRefreshableError(
                playlist_id, "solo las playlists del sistema se regeneran"
            )
        if playlist.query is None:
            raise PlaylistNotRefreshableError(
                playlist_id,
                "esta playlist no tiene query de snapshot asociada "
                "(fue creada antes de la migración 0008); recreala para poder refrescarla",
            )
        query_value = playlist.query
        try:
            query = PlaylistSystemQuery(query_value)
        except ValueError:
            raise PlaylistNotRefreshableError(
                playlist_id,
                f"query de snapshot inválida ({query_value!r})",
            ) from None
        song_ids = await self._snapshot_song_ids(query)
        await self._repository.replace_songs(playlist, song_ids)
        return await self._repository.get(playlist.id)  # type: ignore[return-value]

    async def delete_system_playlist(
        self, admin: PanelUser, playlist_id: uuid.UUID
    ) -> None:
        """Borra una playlist del sistema (admin only).

        El endpoint de panel solo permite borrar `kind='system'`: las playlists
        de usuario pertenecen a la app y no se gestionan desde acá.
        """
        playlist = await self._get_mutable(playlist_id, admin)
        if playlist.kind != "system":
            raise PlaylistForbiddenError()
        await self._repository.delete(playlist)

    async def _snapshot_song_ids(
        self, query: PlaylistSystemQuery
    ) -> list[uuid.UUID]:
        """IDs de canciones del snapshot, en orden de ranking.

        `top_song_ids` ya viene ordenado por count desc (y por song_id como
        tie-breaker determinista); `new` usa el orden de creación desc.
        """
        if query is PlaylistSystemQuery.TOP_WEEK:
            since = datetime.now(timezone.utc) - timedelta(days=7)
            ranking = await self._listens.top_song_ids(
                since=since, limit=_SYSTEM_SNAPSHOT_LIMIT
            )
            return [song_id for song_id, _ in ranking]
        if query is PlaylistSystemQuery.TOP_MONTH:
            now = datetime.now(timezone.utc)
            since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            ranking = await self._listens.top_song_ids(
                since=since, limit=_SYSTEM_SNAPSHOT_LIMIT
            )
            return [song_id for song_id, _ in ranking]
        # "new": canciones recién agregadas (SongRepository.list ordena por
        # created_at desc).
        latest = await self._songs.list(offset=0, limit=_SYSTEM_SNAPSHOT_LIMIT)
        return [song.id for song in latest]

    async def _get_mutable(
        self, playlist_id: uuid.UUID, user: PanelUser
    ) -> Playlist:
        """Control de mutación de una playlist desde el panel.

        - `system`: solo un admin (sin importar quién la creó; el dueño es el
          usuario fijo del sistema, no el admin).
        - `user`: solo el dueño. La app no muta playlists de usuario por acá.
        """
        playlist = await self._repository.get(playlist_id)
        if playlist is None:
            raise PlaylistNotFoundError(playlist_id)

        if playlist.kind == "system":
            if not self._is_admin(user):
                raise PlaylistForbiddenError()
            return playlist

        if playlist.owner_id != user.id:
            raise PlaylistForbiddenError()
        return playlist


async def get_playlist_service(
    repository: PlaylistRepository = Depends(get_playlist_repository),
    song_repository: SongRepository = Depends(get_song_repository),
    listen_repository: ListenRepository = Depends(get_listen_repository),
) -> PlaylistService:
    return PlaylistService(repository, song_repository, listen_repository)
