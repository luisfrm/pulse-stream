from datetime import datetime

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlalchemy import DateTime, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.db.base import Base


class PanelUser(SQLAlchemyBaseUserTableUUID, Base):
    """Tabla `panel_users`: cuentas del panel/admin local.

    Es la única tabla contra la que autentica FastAPI (fastapi-users). No tiene
    FKs a `users`: el panel no posee playlists, favoritos ni listens. `role` es
    la única fuente de permisos (`NULL` = sin acceso al panel, `"admin"` =
    acceso completo); `is_superuser` se mantiene porque fastapi-users lo exige,
    pero siempre queda en False y NO se usa para autorizar.
    """

    __tablename__ = "panel_users"

    # Nullable por compatibilidad con datos copiados de `users`; el alta nueva
    # (init/seed) siempre setea un hash. `UserManager.authenticate` rechaza el
    # login sin password (400) sin tocar pwdlib.
    hashed_password: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )

    # role: NULL = sin acceso al panel; "admin" = administrador. Regla de
    # enums (AGENTS.md): los valores se validan SOLO en Pydantic.
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    username: Mapped[str | None] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )
    cover_key: Mapped[str | None] = mapped_column(String(1024))
    total_plays: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @property
    def cover_url(self) -> str | None:
        """URL pública de la foto de perfil vía el dominio público de R2."""
        if self.cover_key and settings.r2_public_base_url:
            return f"{settings.r2_public_base_url.rstrip('/')}/{self.cover_key}"
        return None
