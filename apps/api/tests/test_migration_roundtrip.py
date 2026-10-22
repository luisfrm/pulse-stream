"""Round-trip real de la migración 0012 en un schema descartable.

No usa `Base.metadata.create_all`: corre Alembic en un schema aislado del
`TEST_DATABASE_URL` para ejercitar el SQL de `0012`. Reproduce el caso que
rompía el downgrade viejo: un admin panel-only (creado por `/init`, sin fila en
`users`) y una playlist `system`. El downgrade debe dejar la playlist con el
usuario de sistema (fila válida de `users`) y no escribir el UUID panel-only en
`playlists.owner_id`.
"""

import asyncio
import os
import subprocess
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.features.users.models import SYSTEM_USER_ID
from tests.conftest import TEST_DATABASE_URL

pytestmark = pytest.mark.asyncio

API_DIR = Path(__file__).resolve().parents[1]
_TIMEOUT = 300

# Alembic necesita una conexión DIRECTA: PgBouncer (pooled) puede resetear el
# search_path entre transacciones y las migraciones caerían en `public`. Neon
# expone el host directo quitando el sufijo `-pooler`.
MIGRATION_DATABASE_URL = (
    TEST_DATABASE_URL.replace("-pooler", "")
    if TEST_DATABASE_URL and "-pooler" in TEST_DATABASE_URL
    else TEST_DATABASE_URL
)


async def _run_alembic(env: dict[str, str], *args: str) -> None:
    result = await asyncio.to_thread(
        subprocess.run,
        ["uv", "run", "alembic", *args],
        cwd=API_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=_TIMEOUT,
    )
    assert result.returncode == 0, (
        f"alembic {' '.join(args)} falló\n"
        f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


@pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL no está configurada: sin DB para el roundtrip",
)
async def test_0012_roundtrip_with_panel_only_admin_and_system_playlist():
    schema = f"migration_rt_{uuid.uuid4().hex[:12]}"
    engine = create_async_engine(MIGRATION_DATABASE_URL)

    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))

    try:
        env = os.environ.copy()
        env["DATABASE_URL"] = MIGRATION_DATABASE_URL
        env["DATABASE_URL_DIRECT"] = MIGRATION_DATABASE_URL
        env["ALEMBIC_SCHEMA"] = schema
        env["ENV"] = "local"
        env.setdefault("AUTH_SECRET", "migration-roundtrip-secret")

        await _run_alembic(env, "upgrade", "head")

        # Único panel_user: un admin panel-only (no existe en `users`).
        panel_admin_id = uuid.uuid4()
        playlist_id = uuid.uuid4()
        async with engine.begin() as conn:
            await conn.execute(text(f'DELETE FROM "{schema}".panel_users'))
            await conn.execute(
                text(
                    f"""
                    INSERT INTO "{schema}".panel_users (
                        id, email, hashed_password, is_active, is_superuser,
                        is_verified, role
                    )
                    VALUES (
                        :id, :email, 'not-a-real-hash', true, false, true, 'admin'
                    )
                    """
                ),
                {
                    "id": panel_admin_id,
                    "email": f"panel-{uuid.uuid4().hex[:8]}@example.com",
                },
            )
            await conn.execute(
                text(
                    f"""
                    INSERT INTO "{schema}".playlists (
                        id, kind, name, is_public, owner_id
                    )
                    VALUES (:id, 'system', 'Roundtrip system', true, :owner_id)
                    """
                ),
                {"id": playlist_id, "owner_id": SYSTEM_USER_ID},
            )

        # El downgrade viejo escribía panel_admin_id en owner_id -> FK violation.
        await _run_alembic(env, "downgrade", "0011")

        async with engine.connect() as conn:
            owner_id = (
                await conn.execute(
                    text(
                        f'SELECT owner_id FROM "{schema}".playlists WHERE id = :id'
                    ),
                    {"id": playlist_id},
                )
            ).scalar_one()
            system_users = (
                await conn.execute(
                    text(f'SELECT count(*) FROM "{schema}".users WHERE id = :id'),
                    {"id": SYSTEM_USER_ID},
                )
            ).scalar_one()
            panel_table = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM information_schema.tables "
                        "WHERE table_schema = :schema AND table_name = 'panel_users'"
                    ),
                    {"schema": schema},
                )
            ).scalar_one()

        assert owner_id == SYSTEM_USER_ID
        assert system_users == 1
        assert panel_table == 0

        # Re-upgrade: idempotente con el usuario de sistema residual.
        await _run_alembic(env, "upgrade", "head")

        async with engine.connect() as conn:
            owner_id = (
                await conn.execute(
                    text(
                        f'SELECT owner_id FROM "{schema}".playlists WHERE id = :id'
                    ),
                    {"id": playlist_id},
                )
            ).scalar_one()
            system_users = (
                await conn.execute(
                    text(f'SELECT count(*) FROM "{schema}".users WHERE id = :id'),
                    {"id": SYSTEM_USER_ID},
                )
            ).scalar_one()
            panel_table = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM information_schema.tables "
                        "WHERE table_schema = :schema AND table_name = 'panel_users'"
                    ),
                    {"schema": schema},
                )
            ).scalar_one()

        assert owner_id == SYSTEM_USER_ID
        assert system_users == 1
        assert panel_table == 1
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await engine.dispose()
