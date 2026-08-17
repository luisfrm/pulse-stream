"""Subida de canciones con presigned URLs (plan sección 11).

El navegador sube el archivo DIRECTO a R2 con el PUT firmado — el audio nunca
pasa por FastAPI. El bucket necesita CORS habilitado para PUT desde el dominio
del frontend (ver plan 10.1).
"""

import uuid

import boto3
from botocore.config import Config

from app.core.config import settings
from app.features.uploads.schemas import PresignRequest, PresignResponse
from app.shared.exceptions import InvalidUploadError, R2NotConfiguredError

ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/mp3"}
PRESIGN_EXPIRES_SECONDS = 600  # 5-10 min: ventana para subir el archivo


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


class UploadService:
    """Valida el archivo y firma una URL de subida. Nada de HTTP."""

    def __init__(self, storage: R2Storage | None = None) -> None:
        self._storage = storage or R2Storage()

    async def presign_upload(self, payload: PresignRequest) -> PresignResponse:
        if payload.content_type not in ALLOWED_CONTENT_TYPES:
            raise InvalidUploadError(
                f"Tipo de archivo no permitido: {payload.content_type}. "
                "Solo se aceptan archivos de audio MP3 (audio/mpeg)."
            )
        if payload.size > settings.r2_max_upload_bytes:
            raise InvalidUploadError(
                f"El archivo supera el tamaño máximo de "
                f"{settings.r2_max_upload_bytes // (1024 * 1024)} MB."
            )
        if not self._storage.enabled:
            raise R2NotConfiguredError()

        object_key = f"songs/{uuid.uuid4()}.mp3"
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
