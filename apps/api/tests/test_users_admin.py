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
    # role es null (usuario normal) o "admin"
    assert all(u["role"] in (None, "admin") for u in users)


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


@pytest.mark.asyncio
async def test_normal_user_cannot_assign_roles(client):
    email = _email()
    await _register(client, email)
    await _login(client, email)

    victim = await _register(client, _email())

    resp = await client.patch(
        f"/admin/users/{victim['id']}/role", json={"role": "admin"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_promote_and_demote(client, session):
    admin_email = _email()
    await _register(client, admin_email)
    await _login(client, admin_email)
    await _promote_to_admin(session, admin_email)

    victim = await _register(client, _email())
    assert victim["role"] is None

    # Promover a admin
    resp = await client.patch(
        f"/admin/users/{victim['id']}/role", json={"role": "admin"}
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"

    # Revocar (null)
    resp = await client.patch(
        f"/admin/users/{victim['id']}/role", json={"role": None}
    )
    assert resp.status_code == 200
    assert resp.json()["role"] is None


@pytest.mark.asyncio
async def test_admin_cannot_revoke_own_role(client, session):
    admin_email = _email()
    me = await _register(client, admin_email)
    await _login(client, admin_email)
    await _promote_to_admin(session, admin_email)

    resp = await client.patch(
        f"/admin/users/{me['id']}/role", json={"role": None}
    )
    assert resp.status_code == 400
    assert "propio rol" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_set_role_nonexistent_user(client, session):
    admin_email = _email()
    await _register(client, admin_email)
    await _login(client, admin_email)
    await _promote_to_admin(session, admin_email)

    resp = await client.patch(
        f"/admin/users/{uuid.uuid4()}/role", json={"role": "admin"}
    )
    assert resp.status_code == 404
