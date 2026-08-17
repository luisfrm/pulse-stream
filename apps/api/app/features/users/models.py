from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID

from app.db.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """Tabla `users`.

    Regla de enums (AGENTS.md): los valores permitidos de `role` se validan
    SOLO en Pydantic (features/users/schemas.py). La columna es VARCHAR plano
    — así un cambio de roles nunca rompe una migración de Alembic.
    """

    __tablename__ = "users"

    # role: NULL = usuario normal (sin permisos especiales); "admin" = panel.
    # Regla de enums (AGENTS.md): los valores se validan SOLO en Pydantic.
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
