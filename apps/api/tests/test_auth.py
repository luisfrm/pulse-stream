import pytest

from tests.helpers import PASSWORD, create_panel_user, email, login

pytestmark = pytest.mark.asyncio


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_login_me_logout(client, session):
    account = await create_panel_user(session, email())

    # Login setea la cookie HttpOnly "session"
    await login(client, account.email)
    assert "session" in client.cookies

    resp = await client.get("/users/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == account.email
    assert body["is_superuser"] is False
    assert "hashed_password" not in body

    resp = await client.post("/auth/logout")
    assert resp.status_code == 204
    assert "session" not in client.cookies

    resp = await client.get("/users/me")
    assert resp.status_code == 401


async def test_login_bad_credentials(client, session):
    account = await create_panel_user(session, email())

    resp = await client.post(
        "/auth/login", data={"username": account.email, "password": "wrong-password"}
    )
    assert resp.status_code == 400
    assert "session" not in client.cookies


async def test_login_inactive_account_rejected(client, session):
    account = await create_panel_user(session, email())
    account.is_active = False
    await session.commit()

    resp = await client.post(
        "/auth/login",
        data={"username": account.email, "password": PASSWORD},
    )
    assert resp.status_code == 400


async def test_users_me_requires_auth(client):
    resp = await client.get("/users/me")
    assert resp.status_code == 401


async def test_update_me_username_cover_and_ignores_role(client, session):
    account = await create_panel_user(session, email())
    await login(client, account.email)

    profile_key = "covers/44444444-4444-4444-8444-444444444444.webp"
    resp = await client.patch(
        "/users/me",
        json={"username": "panel-nombre", "cover_key": profile_key, "role": "admin"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["username"] == "panel-nombre"
    assert body["cover_key"] == profile_key
    # `role` no es parte de UserUpdate: no se puede escalar por acá.
    assert body["role"] is None

    resp = await client.get("/users/me")
    assert resp.json()["username"] == "panel-nombre"
    assert resp.json()["total_plays"] == 0


async def test_public_register_removed(client):
    """El panel no tiene registro público: solo /init cuando está vacío."""
    resp = await client.post(
        "/auth/register", json={"email": email(), "password": PASSWORD}
    )
    assert resp.status_code == 404
