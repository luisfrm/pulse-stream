"""Configuración centralizada del proyecto.

Toda decisión condicional al entorno (cookies Secure/SameSite, Swagger, logs)
vive acá — nunca `if os.getenv(...)` regado por el código.
"""

from enum import Enum
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import model_validator
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


# Regex CORS autoritativo en local: solo localhost/127.0.0.1 en cualquier
# puerto (puertos distintos siguen siendo same-site, Lax funciona).
LOCAL_CORS_ORIGIN_REGEX = r"http://localhost:\d+|http://127\.0\.0\.1:\d+"


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
    # En local se ignora y se fuerza el loopback (ver validador).
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
    # Tope total para un ZIP importado en /albums/{id}/import-zip (512 MB)
    r2_max_zip_import_bytes: int = 512 * 1024 * 1024

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

    # SameSite de la cookie de sesión. Default "lax": cubre local (front/back
    # en localhost) y prod cuando front y API son subdominios del mismo dominio
    # registrable (same-site, ej. pulse-stream.luisrivas.site +
    # pulse-stream-api.luisrivas.site). Seteá "none" SOLO si front y API viven
    # en dominios completamente distintos (cross-site real) — en ese caso el
    # navegador exige además Secure=True (ya lo garantiza cookie_secure).
    # En local se fuerza "lax" (ver validador): "none" sobre http plano el
    # navegador lo rechaza.
    cookie_samesite: Literal["lax", "none"] = "lax"

    # Dominio de la cookie de sesión. En prod con subdominios (front en
    # pulse-stream.luisrivas.site + API en pulse-stream-api.luisrivas.site)
    # seteá el dominio registrable ("luisrivas.site") para que la cookie viaje
    # a todos los subdominios — sin esto el proxy del front nunca ve la cookie
    # y se bucla en /login. En local se fuerza None (ver validador): cookie
    # host-only para localhost, que el navegador comparte entre puertos
    # (3000/8000). Un Domain de prod en local hace que el navegador descarte
    # el Set-Cookie del login (204) y el siguiente GET /users/me dé 401.
    cookie_domain: str | None = None

    @model_validator(mode="after")
    def _normalize_for_env(self) -> "Settings":
        """Hace a `ENV` autoritativo sin campos nuevos.

        Solo cambiando `ENV` se ajusta todo; los valores de prod pueden quedar
        en el `.env` local sin romper nada:
        - local: `cookie_domain` -> None, `cors_origin_regex` -> loopback,
          `cookie_samesite` "none" -> "lax".
        - dev/prod: se respetan los valores tal cual (más normalizar "" a None).
        """
        if not self.cookie_domain:
            self.cookie_domain = None
        if self.env == Environment.LOCAL:
            self.cookie_domain = None
            self.cors_origin_regex = LOCAL_CORS_ORIGIN_REGEX
            if self.cookie_samesite == "none":
                self.cookie_samesite = "lax"
        return self

    @property
    def docs_enabled(self) -> bool:
        # Swagger/Redoc habilitados solo en local
        return self.is_local


settings = Settings()
