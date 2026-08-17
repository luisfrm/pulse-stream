import uuid

import pytest
from sqlalchemy import select

from app.features.users.models import User

from tests.test_auth import PASSWORD, _email, _login, _register


async def _promote_to_admin(session, email: str) -> None:
    user = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one()
    user.is_superuser = True
    user.role = "admin"
    await session.commit()


@pytest.mark.asyncio
async def test_list_users_requires_superuser(client):
    email = _email()
    await _register(client, email)
    await _login(client, email)

    # Usuario normal autenticado -> 403
    resp = await client.get("/admin/users")
    assert resp.status_code == 403

    # Sin autenticar -> 401
    client.cookies.clear()
    resp = await client.get("/admin/users")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_can_list_users(client, session):
    await _register(client, _email())
    email = _email()
    await _register(client, email)
    await _login(client, email)
    await _promote_to_admin(session, email)

    resp = await client.get("/admin/users")
    assert resp.status_code == 200
    users = resp.json()
    assert len(users) >= 2
    assert all(u["role"] in ("admin", "user") for u in users)


@pytest.mark.asyncio
async def test_admin_cannot_delete_self(client, session):
    email = _email()
    user = await _register(client, email)
    await _login(client, email)
    await _promote_to_admin(session, email)

    resp = await client.delete(f"/admin/users/{user['id']}")
    assert resp.status_code == 400
    assert "propia cuenta" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_admin_can_delete_other_user(client, session):
    admin_email = _email()
    await _register(client, admin_email)
    await _login(client, admin_email)
    await _promote_to_admin(session, admin_email)

    victim = await _register(client, _email())

    resp = await client.delete(f"/admin/users/{victim['id']}")
    assert resp.status_code == 204

    # El usuario borrado ya no puede loguearse
    resp = await client.post(
        "/auth/login",
        data={"username": victim["email"], "password": PASSWORD},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_nonexistent_user(client, session):
    email = _email()
    await _register(client, email)
    await _login(client, email)
    await _promote_to_admin(session, email)

    resp = await client.delete(f"/admin/users/{uuid.uuid4()}")
    assert resp.status_code == 404
