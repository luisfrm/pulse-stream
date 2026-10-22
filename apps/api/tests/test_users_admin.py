import uuid

import pytest

from tests.helpers import create_panel_user, email, login

pytestmark = pytest.mark.asyncio


async def test_list_users_requires_admin(client, session):
    account = await create_panel_user(session, email())
    await login(client, account.email)

    # Cuenta del panel sin rol -> 403
    resp = await client.get("/admin/users")
    assert resp.status_code == 403

    # Sin autenticar -> 401
    client.cookies.clear()
    resp = await client.get("/admin/users")
    assert resp.status_code == 401


async def test_is_superuser_without_role_is_denied(client, session):
    """`is_superuser` existe por fastapi-users, pero no autoriza nada."""
    account = await create_panel_user(session, email())
    account.is_superuser = True
    await session.commit()
    await login(client, account.email)

    resp = await client.get("/admin/users")
    assert resp.status_code == 403

    resp = await client.post("/artists", json={"name": "No permitido"})
    assert resp.status_code == 403


async def test_admin_can_list_panel_users(client, session):
    await create_panel_user(session, email())
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    resp = await client.get("/admin/users")
    assert resp.status_code == 200
    users = resp.json()
    assert len(users) >= 2
    assert all(u["role"] in (None, "admin") for u in users)
    by_id = {u["id"]: u for u in users}
    assert by_id[str(admin.id)]["is_superuser"] is False


async def test_admin_cannot_delete_self(client, session):
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    resp = await client.delete(f"/admin/users/{admin.id}")
    assert resp.status_code == 400
    assert "propia cuenta" in resp.json()["detail"]


async def test_admin_can_delete_other_panel_user(client, session):
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    victim = await create_panel_user(session, email())

    resp = await client.delete(f"/admin/users/{victim.id}")
    assert resp.status_code == 204

    # La cuenta borrada ya no puede loguearse
    resp = await client.post(
        "/auth/login",
        data={"username": victim.email, "password": "Str0ng-Pass!-42"},
    )
    assert resp.status_code == 400


async def test_delete_nonexistent_user(client, session):
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    resp = await client.delete(f"/admin/users/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_normal_panel_user_cannot_assign_roles(client, session):
    normal = await create_panel_user(session, email())
    await login(client, normal.email)

    victim = await create_panel_user(session, email())

    resp = await client.patch(
        f"/admin/users/{victim.id}/role", json={"role": "admin"}
    )
    assert resp.status_code == 403


async def test_admin_can_promote_and_demote(client, session):
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    victim = await create_panel_user(session, email())
    assert victim.role is None

    resp = await client.patch(
        f"/admin/users/{victim.id}/role", json={"role": "admin"}
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"

    resp = await client.patch(
        f"/admin/users/{victim.id}/role", json={"role": None}
    )
    assert resp.status_code == 200
    assert resp.json()["role"] is None


async def test_admin_cannot_revoke_own_role(client, session):
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    resp = await client.patch(
        f"/admin/users/{admin.id}/role", json={"role": None}
    )
    assert resp.status_code == 400
    assert "propio rol" in resp.json()["detail"]


async def test_set_role_nonexistent_user(client, session):
    admin = await create_panel_user(session, email(), role="admin")
    await login(client, admin.email)

    resp = await client.patch(
        f"/admin/users/{uuid.uuid4()}/role", json={"role": "admin"}
    )
    assert resp.status_code == 404
