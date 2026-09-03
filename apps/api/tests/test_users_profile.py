import pytest

from tests.helpers import PASSWORD, email, register_and_login

pytestmark = pytest.mark.asyncio


async def test_register_with_username(client):
    username = f"usuario-{email().split('@')[0]}"
    resp = await client.post(
        "/auth/register",
        json={"email": email(), "password": PASSWORD, "username": username},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["username"] == username


async def test_register_duplicate_username_rejected(client):
    """El username es único (case-insensitive) — segundo registro falla."""
    username = f"dupe-{email().split('@')[0]}"
    first = email()
    resp = await client.post(
        "/auth/register",
        json={"email": first, "password": PASSWORD, "username": username},
    )
    assert resp.status_code == 201, resp.text

    resp = await client.post(
        "/auth/register",
        json={"email": email(), "password": PASSWORD, "username": username.upper()},
    )
    assert resp.status_code == 400


async def test_update_username_and_cover(client):
    user = await register_and_login(client)
    assert user["username"] is None  # registro sin username -> null

    resp = await client.patch("/users/me", json={"username": "nuevo-nombre"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["username"] == "nuevo-nombre"
    # cover del perfil: se asigna con el object_key del presign
    # (`covers/{uuid}.webp`: el schema exige el patrón estricto en escritura).
    profile_key = "covers/44444444-4444-4444-8444-444444444444.webp"
    resp = await client.patch("/users/me", json={"cover_key": profile_key})
    assert resp.status_code == 200
    assert resp.json()["cover_key"] == profile_key

    resp = await client.get("/users/me")
    assert resp.json()["username"] == "nuevo-nombre"
    assert resp.json()["total_plays"] == 0


async def test_update_username_taken_rejected(client):
    await register_and_login(client)
    taken = f"tomado-{email().split('@')[0]}"
    resp = await client.patch("/users/me", json={"username": taken})
    assert resp.status_code == 200, resp.text

    # otro usuario intenta tomar el mismo username (case-insensitive)
    await register_and_login(client)
    resp = await client.patch("/users/me", json={"username": taken.upper()})
    assert resp.status_code == 400


async def test_register_username_validation(client):
    # username inválido -> 422 (min 2 chars, solo \w . - y espacio)
    resp = await client.post(
        "/auth/register",
        json={"email": email(), "password": PASSWORD, "username": "a"},
    )
    assert resp.status_code == 422
