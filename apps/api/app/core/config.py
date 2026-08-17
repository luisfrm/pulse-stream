"""Configuración centralizada del proyecto.

Toda decisión condicional al entorno (cookies Secure/SameSite, Swagger, logs)
vive acá — nunca `if os.getenv(...)` regado por el código.
"""

from enum import Enum
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


def _async_url(url: str) -> str:
    """Convierte una URL de Neon en una URL lista para SQLAlchemy async.

    - Neon entrega `postgresql://...` sin driver: se agrega `+asyncpg`.
    - asyncpg 0.31 no acepta los params `sslmode`/`channel_binding` como kwargs:
      `sslmode` se mapea a `ssl` (que sí soporta) y `channel_binding` se
      descarta (TLS queda cubierto por `ssl`).
    """
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    elif url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif not url.startswith("postgresql+asyncpg://"):
        return url

    parts = urlsplit(url)
    if not parts.query:
        return url

    query = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            query.append(("ssl", value))
        elif key == "channel_binding":
            continue
        else:
            query.append((key, value))

    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


class Environment(str, Enum):
    """Una sola env var `ENV`; si no está seteada, el default es `local`."""

    LOCAL = "local"
    DEV = "dev"
    PROD = "prod"


class Settings(BaseSettings):
    """Settings tipados leídos desde variables de entorno / `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Entorno ---
    env: Environment = Environment.LOCAL

    # --- Secretos ---
    auth_secret: str
    database_url: str

    # Conexión DIRECTA de Neon (sin -pooler). Alembic la usa para migraciones;
    # si no se define, cae a database_url.
    database_url_direct: str | None = None

    # --- CORS ---
    # Regex de orígenes permitidos con credenciales (cookies).
    # Nunca `*` con cookies: el navegador lo bloquea.
    cors_origin_regex: str = (
        r"https://([a-zA-Z0-9-]+\.)?tudominio\.com|http://localhost:\d+"
    )

    # --- Rate limiting (slowapi) ---
    rate_limit_login: str = "5/minute"
    rate_limit_register: str = "3/hour"
    rate_limit_presign: str = "10/minute"

    # --- Cloudflare R2 (Fase 1: subida de canciones con presigned URLs) ---
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    # Dominio público del bucket (R2 > bucket > Settings > Custom Domain).
    # Si está seteado, SongRead expone `stream_url` para reproducir sin auth.
    r2_public_base_url: str = ""
    # Tamaño máximo de archivo de audio aceptado en /uploads/presign (50 MB)
    r2_max_upload_bytes: int = 50 * 1024 * 1024

    @property
    def r2_endpoint(self) -> str:
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

    @property
    def r2_enabled(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket_name
        )

    # --- Propiedades derivadas ---
    @property
    def async_database_url(self) -> str:
        """URL lista para SQLAlchemy async (ver `_async_url`)."""
        return _async_url(self.database_url)

    @property
    def async_database_url_direct(self) -> str | None:
        """Versión async de la conexión directa (para Alembic)."""
        if not self.database_url_direct:
            return None
        return _async_url(self.database_url_direct)

    @property
    def is_local(self) -> bool:
        return self.env == Environment.LOCAL

    @property
    def cookie_secure(self) -> bool:
        # SameSite=None exige Secure=True por spec del navegador;
        # en local casi siempre corremos sobre http plano.
        return not self.is_local

    @property
    def cookie_samesite(self) -> Literal["lax", "none"]:
        # local: front y back comparten "site" (localhost:puerto) -> lax basta
        # dev/prod: dominios distintos, acceso cross-site real -> none
        return "lax" if self.is_local else "none"

    @property
    def docs_enabled(self) -> bool:
        # Swagger/Redoc habilitados solo en local
        return self.is_local


settings = Settings()
