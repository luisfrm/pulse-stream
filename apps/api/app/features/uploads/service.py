"""Subida de canciones con presigned URLs (plan sección 11).

El navegador sube el archivo DIRECTO a R2 con el PUT firmado — el audio nunca
pasa por FastAPI. El bucket necesita CORS habilitado para PUT desde el dominio
del frontend (ver plan 10.1).

Excepción deliberada: el import por ZIP de un álbum (`ZipImportService`).
El ZIP viaja por FastAPI (operación admin de carga masiva), pero cada audio se
guarda igual en R2 (PUT server-side con las mismas credenciales que firman).
"""

import io
import logging
import os
import uuid
import zipfile

import boto3
import mutagen
from botocore.config import Config
from fastapi import Depends
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.core.config import settings
from app.features.albums.repository import AlbumRepository, get_album_repository
from app.features.songs.models import Song
from app.features.songs.repository import SongRepository, get_song_repository
from app.features.songs.schemas import SongCreate
from app.features.songs.service import SongService, get_song_service
from app.features.uploads.schemas import (
    PresignRequest,
    PresignResponse,
    ZipImportIssue,
    ZipImportResult,
)
from app.shared.exceptions import (
    AlbumNotFoundError,
    InvalidUploadError,
    R2NotConfiguredError,
)

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/aac",
    "audio/x-hx-aac-adts",
    # Los navegadores/OS reportan .aac como ADTS (DLNA) — variante del mismo codec.
    "audio/vnd.dlna.adts",
}
ALLOWED_COVER_TYPES = {"image/jpeg", "image/jpg", "image/webp"}
# Extensión del object_key según el content type del audio.
AUDIO_EXTENSIONS = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/aac": ".aac",
    "audio/x-hx-aac-adts": ".aac",
    "audio/vnd.dlna.adts": ".aac",
}
# Extensión del object_key según el content type del cover.
COVER_EXTENSIONS = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp"}
# Covers son cuadrículas (portadas/artistas): JPG/WebP de hasta 512 KB.
MAX_COVER_BYTES = 512 * 1024
PRESIGN_EXPIRES_SECONDS = 600  # 5-10 min: ventana para subir el archivo
# Import por ZIP de álbumes: solo MP3 y AAC (mismos codecs que /uploads/presign).
IMPORT_EXTENSIONS = {".mp3": "audio/mpeg", ".aac": "audio/aac"}


def _probe_audio(data: bytes) -> tuple[str | None, int | None, bool]:
    """Lee título (ID3 TIT2) y duración de un MP3/AAC con mutagen.

    Devuelve `(title, duration, recognized)`. Si `recognized` es False, mutagen
    no pudo parsear el archivo y se recomienda rechazarlo (evita subir un
    archivo renombrado que no sea audio válido).
    """
    try:
        audio = mutagen.File(fileobj=io.BytesIO(data))
    except Exception:
        return None, None, False
    if audio is None:
        return None, None, False

    title: str | None = None
    try:
        tag = audio.tags.get("TIT2") if audio.tags else None
        if tag is not None and tag.text:
            title = str(tag.text[0]).strip() or None
    except Exception:
        title = None

    duration: int | None = None
    try:
        if audio.info is not None and audio.info.length:
            duration = max(1, int(round(audio.info.length)))
    except Exception:
        duration = None
    return title, duration, True


class R2Storage:
    """Cliente S3-compatible apuntando al endpoint de Cloudflare R2."""

    def __init__(self) -> None:
        self.enabled = settings.r2_enabled
        self._client = None
        if self.enabled:
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.r2_endpoint,
                aws_access_key_id=settings.r2_access_key_id,
                aws_secret_access_key=settings.r2_secret_access_key,
                region_name="auto",
                config=Config(signature_version="s3v4"),
            )

    def presign_put(self, object_key: str, content_type: str) -> str:
        assert self._client is not None
        return self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=PRESIGN_EXPIRES_SECONDS,
        )

    def put_object(self, object_key: str, data: bytes, content_type: str) -> None:
        """PUT server-side (usado por el import por ZIP de álbumes)."""
        assert self._client is not None
        self._client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=object_key,
            Body=data,
            ContentType=content_type,
        )


class UploadService:
    """Valida el archivo y firma una URL de subida. Nada de HTTP."""

    def __init__(self, storage: R2Storage | None = None) -> None:
        self._storage = storage or R2Storage()

    async def presign_upload(self, payload: PresignRequest) -> PresignResponse:
        if payload.content_type not in ALLOWED_CONTENT_TYPES:
            raise InvalidUploadError(
                f"Tipo de archivo no permitido: {payload.content_type}. "
                "Solo se aceptan archivos de audio MP3 o AAC "
                "(audio/mpeg, audio/aac)."
            )
        if payload.size > settings.r2_max_upload_bytes:
            raise InvalidUploadError(
                f"El archivo supera el tamaño máximo de "
                f"{settings.r2_max_upload_bytes // (1024 * 1024)} MB."
            )
        if not self._storage.enabled:
            raise R2NotConfiguredError()

        ext = AUDIO_EXTENSIONS[payload.content_type]
        object_key = f"songs/{uuid.uuid4()}{ext}"
        url = self._storage.presign_put(object_key, payload.content_type)
        return PresignResponse(
            url=url,
            object_key=object_key,
            content_type=payload.content_type,
            expires_in=PRESIGN_EXPIRES_SECONDS,
        )

    async def presign_cover(self, payload: PresignRequest) -> PresignResponse:
        """Presigned PUT para covers (cuadrículas): JPG o WebP <= 512 KB."""
        if payload.content_type not in ALLOWED_COVER_TYPES:
            raise InvalidUploadError(
                f"Tipo de archivo no permitido: {payload.content_type}. "
                "Los covers se suben en JPG o WebP (image/jpeg, image/webp)."
            )
        if payload.size > MAX_COVER_BYTES:
            raise InvalidUploadError(
                f"El cover supera el tamaño máximo de 512 KB "
                f"({payload.size} bytes)."
            )
        if not self._storage.enabled:
            raise R2NotConfiguredError()

        ext = COVER_EXTENSIONS[payload.content_type]
        object_key = f"covers/{uuid.uuid4()}{ext}"
        url = self._storage.presign_put(object_key, payload.content_type)
        return PresignResponse(
            url=url,
            object_key=object_key,
            content_type=payload.content_type,
            expires_in=PRESIGN_EXPIRES_SECONDS,
        )


def get_upload_service() -> UploadService:
    """Factory para que FastAPI no introspeccione `R2Storage` como campo."""
    return UploadService()


class ZipImportService:
    """Import por ZIP de un álbum completo (admin).

    Orquesta: descomprimir + validar (.mp3/.aac, tamaños, duplicados) →
    subir a R2 (PUT server-side) → crear canciones con artista/álbum/cover
    del álbum. Los archivos que no cumplen los requisitos se reportan en
    `skipped`/`failed` sin abortar el resto.
    """

    def __init__(
        self,
        songs_repository: SongRepository = Depends(get_song_repository),
        albums_repository: AlbumRepository = Depends(get_album_repository),
        song_service: SongService = Depends(get_song_service),
        storage: R2Storage | None = None,
    ) -> None:
        self._songs = songs_repository
        self._albums = albums_repository
        self._song_service = song_service
        self._storage = storage or R2Storage()

    async def import_album_zip(
        self, album_id: uuid.UUID, zip_data: bytes, zip_name: str = "album.zip"
    ) -> ZipImportResult:
        if not self._storage.enabled:
            raise R2NotConfiguredError()
        if len(zip_data) > settings.r2_max_zip_import_bytes:
            raise InvalidUploadError(
                f"El ZIP supera el tamaño máximo de "
                f"{settings.r2_max_zip_import_bytes // (1024 * 1024)} MB."
            )
        try:
            archive = zipfile.ZipFile(io.BytesIO(zip_data))
        except (zipfile.BadZipFile, OSError):
            raise InvalidUploadError("El archivo no es un ZIP válido.")

        album = await self._albums.get(album_id)
        if album is None:
            raise AlbumNotFoundError(album_id)

        try:
            entries = [info for info in archive.infolist() if not info.is_dir()]
        except RuntimeError:
            raise InvalidUploadError(
                "El ZIP está protegido con contraseña o está corrupto."
            )

        existing_titles = {song.title.casefold() for song in album.songs}
        imported_songs: list[Song] = []
        skipped: list[ZipImportIssue] = []
        failed: list[ZipImportIssue] = []
        uncompressed_total = 0

        for info in sorted(entries, key=lambda item: item.filename):
            name = os.path.basename(info.filename) or info.filename
            ext = os.path.splitext(name)[1].lower()
            if ext not in IMPORT_EXTENSIONS:
                skipped.append(
                    ZipImportIssue(name=name, reason="No es un archivo .mp3 o .aac.")
                )
                continue
            if info.file_size <= 0:
                skipped.append(ZipImportIssue(name=name, reason="El archivo está vacío."))
                continue
            if info.file_size > settings.r2_max_upload_bytes:
                skipped.append(
                    ZipImportIssue(
                        name=name,
                        reason=f"Supera el máximo de "
                        f"{settings.r2_max_upload_bytes // (1024 * 1024)} MB por canción.",
                    )
                )
                continue

            # Protección contra ZIP bomb: validar tamaño descomprimido total
            # antes de leer el archivo en memoria.
            uncompressed_total += info.file_size
            if uncompressed_total > settings.r2_max_zip_import_bytes:
                raise InvalidUploadError(
                    f"El ZIP descomprimido supera el tamaño máximo de "
                    f"{settings.r2_max_zip_import_bytes // (1024 * 1024)} MB."
                )

            try:
                file_data = archive.read(info)
            except RuntimeError:
                failed.append(
                    ZipImportIssue(name=name, reason="No se pudo leer el archivo del ZIP.")
                )
                continue

            title, duration, recognized = _probe_audio(file_data)
            if not recognized:
                failed.append(
                    ZipImportIssue(name=name, reason="El archivo no es un audio válido.")
                )
                continue
            if not title:
                title = os.path.splitext(name)[0].strip() or name
            if title.casefold() in existing_titles:
                skipped.append(
                    ZipImportIssue(
                        name=name,
                        reason="Ya existe una canción con ese título en el álbum.",
                    )
                )
                continue

            object_key = f"songs/{uuid.uuid4()}{ext}"
            try:
                # Primero R2: si el PUT falla, no creamos el registro.
                self._storage.put_object(object_key, file_data, IMPORT_EXTENSIONS[ext])
                song = await self._song_service.create_song(
                    SongCreate(
                        title=title,
                        artist_id=album.artist_id,
                        album_id=album.id,
                        object_key=object_key,
                        cover_key=album.cover_key,
                        duration_seconds=duration,
                    )
                )
                existing_titles.add(title.casefold())
                imported_songs.append(song)
            except (DBAPIError, IntegrityError) as exc:
                # SQLAlchemy invalida la transacción: rollback para poder seguir.
                await self._songs.rollback()
                logger.warning(
                    "zip_import_song_failed_db name=%s object_key=%s",
                    name,
                    object_key,
                    exc_info=exc,
                )
                failed.append(
                    ZipImportIssue(name=name, reason="Error de base de datos al registrar la canción.")
                )
            except Exception as exc:  # noqa: BLE001 — un archivo no aborta el ZIP
                logger.warning(
                    "zip_import_song_failed name=%s object_key=%s",
                    name,
                    object_key,
                    exc_info=exc,
                )
                failed.append(
                    ZipImportIssue(name=name, reason="Error interno al importar el archivo.")
                )

        return ZipImportResult(
            imported=imported_songs,
            skipped=skipped,
            failed=failed,
        )


def get_zip_import_service(
    songs_repository: SongRepository = Depends(get_song_repository),
    albums_repository: AlbumRepository = Depends(get_album_repository),
    song_service: SongService = Depends(get_song_service),
) -> ZipImportService:
    """Factory del import ZIP (los repos se inyectan por Depends)."""
    return ZipImportService(
        songs_repository=songs_repository,
        albums_repository=albums_repository,
        song_service=song_service,
    )
