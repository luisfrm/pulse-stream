import uuid

import pytest


def _email() -> str:
    return f"user-{uuid.uuid4().hex[:10]}@example.com"


PASSWORD = "Str0ng-Pass!-42"


async def _register(client, email: str, password: str = PASSWORD) -> dict:
    resp = await client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _login(client, email: str, password: str = PASSWORD) -> None:
    resp = await client.post(
        "/auth/login", data={"username": email, "password": password}
    )
    assert resp.status_code == 204, resp.text


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_register_login_me_logout(client):
    email = _email()

    # Registro devuelve el usuario con role por defecto
    data = await _register(client, email)
    assert data["email"] == email
    assert data["role"] == "user"
    assert data["is_superuser"] is False
    assert "hashed_password" not in data  # nunca se expone

    # Login setea la cookie HttpOnly "session"
    await _login(client, email)
    assert "session" in client.cookies

    # /users/me con la cookie
    resp = await client.get("/users/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == email

    # Logout borra la cookie
    resp = await client.post("/auth/logout")
    assert resp.status_code == 204
    assert "session" not in client.cookies

    # Ya no estamos autenticados
    resp = await client.get("/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_bad_credentials(client):
    email = _email()
    await _register(client, email)

    resp = await client.post(
        "/auth/login", data={"username": email, "password": "wrong-password"}
    )
    assert resp.status_code == 400
    assert "session" not in client.cookies


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    email = _email()
    await _register(client, email)

    resp = await client.post(
        "/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_users_me_requires_auth(client):
    resp = await client.get("/users/me")
    assert resp.status_code == 401
