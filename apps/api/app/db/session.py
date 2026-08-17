"""Conexión a la base de datos.

Regla Neon (plan sección 2.2):
- La app usa SIEMPRE la connection string POOLED (host con -pooler, PgBouncer).
- Alembic usa la DIRECTA (settings.database_url_direct) para migraciones.
- FastAPI corre como proceso persistente: AsyncEngine con pool y pool_pre_ping
  para descartar conexiones stale si Neon escala a cero.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.async_database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Dependency de FastAPI: una sesión por request.

    Los repositories trabajan con `flush()` (unidades de trabajo dentro de la
    transacción); acá se commitea al cerrar un request exitoso y se hace
    rollback si algo falla. Nota: fastapi-users commitea internamente, lo cual
    es compatible (commit tras commit es un no-op).
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
