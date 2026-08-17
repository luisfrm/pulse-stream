import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends

from app.features.listens.models import Listen
from app.features.listens.repository import ListenRepository, get_listen_repository
from app.features.songs.models import Song
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.users.models import User
from app.shared.exceptions import SongNotFoundError

# Ventana de dedupe: el mismo play consecutivo no debe generar dos registros
# (un double-fire de play/pause, o repetir play sin cambio de canción).
_DEDUPE_WINDOW = timedelta(seconds=30)


class ListenService:
    """Reglas de negocio del historial de reproducciones."""

    def __init__(
        self,
        repository: ListenRepository = Depends(get_listen_repository),
        song_repository: SongRepository = Depends(get_song_repository),
    ) -> None:
        self._repository = repository
        self._songs = song_repository

    async def record_play(self, user: User, song_id: uuid.UUID) -> Listen:
        """Registra un play. Valida la canción y deduplica plays consecutivos.

        Cada play (no duplicado) suma +1 al contador persistente de la canción
        (`songs.play_count`) y +1 a lo escuchado por el usuario
        (`users.total_plays`). Los incrementos son UPDATEs atómicos, race-safe.
        """
        song = await self._songs.get(song_id)
        if song is None:
            raise SongNotFoundError(song_id)

        now = datetime.now(timezone.utc)
        last = await self._repository.last_listen(user.id)
        if (
            last is not None
            and last.song_id == song_id
            and (now - last.played_at) < _DEDUPE_WINDOW
        ):
            # El mismo play consecutivo llegó dos veces: 201 sin duplicar la fila.
            return Listen(
                id=uuid.uuid4(), user_id=user.id, song_id=song_id, played_at=last.played_at
            )

        listen = await self._repository.add(user.id, song_id)
        await self._songs.increment_plays(song_id)
        await self._repository.increment_user_plays(user.id)
        return listen

    async def recently_played(
        self, user: User, offset: int = 0, limit: int = 50
    ) -> tuple[list[Song], int, dict[uuid.UUID, int]]:
        """Canciones reproducidas por el usuario (sin duplicar), por último play.

        Devuelve además `user_play_counts`: cuántas veces tocó el usuario cada
        canción (para mostrarlo en "recientes" sin llamadas extra a la API).
        """
        song_ids = await self._repository.distinct_song_ids(
            user.id, offset=offset, limit=limit
        )
        total = await self._repository.count_distinct_songs(user.id)
        songs = await self._songs.get_by_ids(song_ids)
        # `get_by_ids` devuelve dict; reordenamos según el orden del ranking.
        ordered = [songs[sid] for sid in song_ids if sid in songs]
        counts = await self._repository.play_counts_for_user(user.id, song_ids)
        return ordered, total, counts

    async def popular_songs(
        self,
        limit: int = 10,
        *,
        days: int = 30,
        month: bool = False,
    ) -> list[tuple[Song, int]]:
        """Pares (canción, play_count) más reproducidos.

        - `days`: ventana móvil de los últimos N días.
        - `month`: ventana del mes calendario actual (UTC) — pisó a `days`.
        """
        if month:
            now = datetime.now(timezone.utc)
            since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            since = datetime.now(timezone.utc) - timedelta(days=days)
        ranking = await self._repository.top_song_ids(since=since, limit=limit)
        songs = await self._songs.get_by_ids([song_id for song_id, _ in ranking])
        return [(songs[song_id], plays) for song_id, plays in ranking if song_id in songs]


async def get_listen_service(
    repository: ListenRepository = Depends(get_listen_repository),
    song_repository: SongRepository = Depends(get_song_repository),
) -> ListenService:
    return ListenService(repository, song_repository)
