"""Fixtures de integración.

Los tests corren contra una base Postgres real apuntada por TEST_DATABASE_URL
(no tocan la DB de desarrollo). Si la variable no está seteada, los tests se
saltan con un mensaje claro — así el CI y las corridas locales sin DB no fallan.
"""

import os

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Los tests leen el .env de la app (TEST_DATABASE_URL vive ahí).
load_dotenv()

from app.core.config import _async_url  # noqa: E402

TEST_DATABASE_URL = _async_url(os.getenv("TEST_DATABASE_URL", ""))


@pytest_asyncio.fixture(scope="session")
async def engine():
    if not TEST_DATABASE_URL:
        pytest.skip(
            "TEST_DATABASE_URL no está configurada: saltando tests de integración. "
            "Usá una base de tests (ej. una branch de Neon) para correrlos."
        )

    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)

    # Importa los modelos para registrar TODAS las tablas en Base.metadata
    from app.db.base import Base
    import app.features.albums.models  # noqa: F401
    import app.features.artists.models  # noqa: F401
    import app.features.songs.models  # noqa: F401
    import app.features.users.models  # noqa: F401
    import app.features.playlists.models  # noqa: F401
    import app.features.favorites.models  # noqa: F401
    import app.features.listens.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def session(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(session):
    from app.main import app
    from app.db.session import get_session

    # Los tests comparten una sesión de la base de TESTS, no la de desarrollo.
    async def override_get_session():
        yield session

    app.dependency_overrides[get_session] = override_get_session

    # Deshabilita el rate limiting para no romper tests que registran varios users
    app.state.limiter.enabled = False

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()
