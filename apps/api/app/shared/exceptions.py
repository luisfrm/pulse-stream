"""Excepciones de dominio + handler global.

El service NUNCA sabe de HTTP (AGENTS.md): lanza excepciones de dominio acá
definidas, y un único exception_handler en main.py las traduce a respuestas.
"""

import uuid


class AppError(Exception):
    """Base de errores de dominio. Las subclases definen status y detail."""

    status_code: int = 500
    detail: str = "Error interno"

    def __init__(self, detail: str | None = None) -> None:
        if detail is not None:
            self.detail = detail
        super().__init__(self.detail)


class NotFoundError(AppError):
    status_code = 404
    detail = "No encontrado"


class UserNotFoundError(NotFoundError):
    def __init__(self, user_id: uuid.UUID) -> None:
        super().__init__(f"Usuario {user_id} no existe")


class UserCannotDeleteSelfError(AppError):
    status_code = 400
    detail = "Un admin no puede borrar su propia cuenta"


class ArtistNotFoundError(NotFoundError):
    def __init__(self, artist_id: uuid.UUID) -> None:
        super().__init__(f"Artista {artist_id} no existe")


class ArtistNameTakenError(AppError):
    status_code = 409

    def __init__(self, name: str) -> None:
        super().__init__(f"Ya existe un artista llamado '{name}'")


class SongNotFoundError(NotFoundError):
    def __init__(self, song_id: uuid.UUID) -> None:
        super().__init__(f"Canción {song_id} no existe")


class InvalidUploadError(AppError):
    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)


class R2NotConfiguredError(AppError):
    status_code = 503
    detail = "El storage (R2) no está configurado. Completá las env vars R2_* en el .env de apps/api."
