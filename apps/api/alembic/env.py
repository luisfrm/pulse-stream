"""Entorno async de Alembic.

Regla Neon (plan 2.2): las migraciones corren contra la conexión DIRECTA
(settings.database_url_direct), nunca la pooled — PgBouncer en transaction
pooling rompe features de sesión que Alembic necesita.
"""

import asyncio
import os
import re
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.db.base import Base
from app.features.users.models import User  # noqa: F401  (registra tablas)
from app.features.users.panel_models import PanelUser  # noqa: F401
from app.features.artists.models import Artist  # noqa: F401
from app.features.albums.models import Album  # noqa: F401  (songs.album_id)
from app.features.songs.models import Song  # noqa: F401
from app.features.playlists.models import Playlist, PlaylistSong  # noqa: F401
from app.features.favorites.models import UserFavorite  # noqa: F401
from app.features.listens.models import Listen  # noqa: F401

# Solo para tests de round-trip: permite correr las migraciones en un schema
# descartable sin tocar el schema público. En deploy no se setea.
# OJO: `server_settings`/search_path en la URL lo ignora PgBouncer (Neon pooled),
# por eso se ejecuta `SET search_path` dentro de la conexión de migración.
_SCHEMA_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _migration_schema() -> str | None:
    schema = os.getenv("ALEMBIC_SCHEMA")
    if not schema:
        return None
    if not _SCHEMA_PATTERN.fullmatch(schema):
        raise ValueError(f"ALEMBIC_SCHEMA inválido: {schema!r}")
    return schema

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option(
    "sqlalchemy.url",
    settings.async_database_url_direct or settings.async_database_url,
)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    schema = _migration_schema()
    if schema is not None:
        # Misma conexión para todo el upgrade/downgrade. Se commitea el SET
        # para que el search_path sobreviva a la transacción que abre Alembic
        # (con PgBouncer el estado de sesión puede resetearse; por eso el test
        # de roundtrip usa la conexión directa de Neon).
        connection.execute(text(f'SET search_path TO "{schema}"'))
        connection.commit()
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
