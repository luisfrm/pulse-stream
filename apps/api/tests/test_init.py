"""Bootstrap del panel: `GET /init/status` y `POST /init`.

El endpoint crea el primer admin SOLO cuando `panel_users` está vacío. Como la
DB de tests se comparte entre archivos, cada test limpia la tabla al empezar.
"""

import pytest
from sqlalchemy import delete

from app.features.users.panel_models import PanelUser
from tests.helpers import PASSWORD, login

pytestmark = pytest.mark.asyncio


async def _clear_panel_users(session) -> None:
    await session.execute(delete(PanelUser))
    await session.commit()


async def test_init_status_when_empty(client, session):
    await _clear_panel_users(session)

    resp = await client.get("/init/status")
    assert resp.status_code == 200
    assert resp.json() == {"needs_init": True}


async def test_init_creates_first_admin_and_is_idempotent(client, session):
    await _clear_panel_users(session)

    resp = await client.post(
        "/init",
        json={
            "email": "First.Admin@Example.com",
            "password": PASSWORD,
            "username": "primer-admin",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "first.admin@example.com"
    assert body["role"] == "admin"
    assert body["is_superuser"] is False
    assert body["is_active"] is True
    assert body["is_verified"] is True
    assert body["username"] == "primer-admin"
    assert "hashed_password" not in body

    # Ya inicializado: status deja de pedir init y un segundo POST da 409.
    resp = await client.get("/init/status")
    assert resp.json() == {"needs_init": False}

    resp = await client.post(
        "/init",
        json={"email": "otro@example.com", "password": PASSWORD},
    )
    assert resp.status_code == 409

    # El admin recién creado puede loguearse y entrar a /admin/users.
    await login(client, "first.admin@example.com")
    resp = await client.get("/users/me")
    assert resp.status_code == 200
    resp = await client.get("/admin/users")
    assert resp.status_code == 200


async def test_init_rejects_short_password(client, session):
    await _clear_panel_users(session)

    resp = await client.post(
        "/init",
        json={"email": "admin@example.com", "password": "short"},
    )
    assert resp.status_code == 422
