"""Seed del admin local del panel y nombre configurable de la cookie.

Cubre:
- `upsert_admin` (crea y rota password) + login por API.
- El nombre de la cookie de sesión configurable (`SESSION_COOKIE_NAME`).
"""

import uuid

import pytest
from pwdlib import PasswordHash

from app.core.config import Settings, settings
from app.features.auth.backend import cookie_transport
from app.features.users.admin_seed import upsert_admin

PASSWORD = "Str0ng-Pass!-42"
NEW_PASSWORD = "An0ther-Pass!-77"


def _email(prefix: str = "admin") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.mark.asyncio
async def test_upsert_admin_creates_and_updates(client, session):
    email_address = _email("Admin").upper()

    created = await upsert_admin(
        session, email_address, PASSWORD, username="panel-admin"
    )

    assert created.email == email_address.lower()
    assert created.role == "admin"
    assert created.is_verified is True
    assert created.is_active is True
    assert created.username == "panel-admin"
    assert created.hashed_password is not None
    assert PasswordHash.recommended().verify(PASSWORD, created.hashed_password)

    # Login por API con la password recién seteada.
    resp = await client.post(
        "/auth/login", data={"username": created.email, "password": PASSWORD}
    )
    assert resp.status_code == 204, resp.text

    # Segunda llamada (sin username): rota el hash, conserva el resto.
    updated = await upsert_admin(session, email_address, NEW_PASSWORD)

    assert updated.id == created.id
    assert updated.role == "admin"
    assert updated.username == "panel-admin"

    resp = await client.post(
        "/auth/login", data={"username": created.email, "password": PASSWORD}
    )
    assert resp.status_code == 400, resp.text

    resp = await client.post(
        "/auth/login", data={"username": created.email, "password": NEW_PASSWORD}
    )
    assert resp.status_code == 204, resp.text


def test_session_cookie_name_configurable(monkeypatch):
    monkeypatch.delenv("SESSION_COOKIE_NAME", raising=False)

    custom = Settings(
        _env_file=None,
        auth_secret="test-secret",
        database_url="postgresql://user:pass@localhost/test",
        session_cookie_name="panel_session",
    )
    assert custom.session_cookie_name == "panel_session"

    default = Settings(
        _env_file=None,
        auth_secret="test-secret",
        database_url="postgresql://user:pass@localhost/test",
    )
    assert default.session_cookie_name == "session"
    # La instancia global usa el default y el transport la respeta.
    assert cookie_transport.cookie_name == settings.session_cookie_name


@pytest.mark.asyncio
async def test_upsert_admin_rejects_invalid_email(session):
    """El admin debe tener un email válido para `UserRead` (EmailStr).

    Un dominio reservado como `.local` crea un usuario que loguea bien pero
    explota en `GET /users/me` con ValidationError; el seed lo rechaza antes.
    """
    with pytest.raises(ValueError):
        await upsert_admin(session, "admin@pulse.local", PASSWORD)
