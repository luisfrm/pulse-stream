import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def test_list_artists_empty(client):
    resp = await client.get("/artists")
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0, "offset": 0, "limit": 50}


async def test_create_artist_requires_auth(client):
    resp = await client.post("/artists", json={"name": "Soda Stereo"})
    assert resp.status_code == 401


async def test_normal_user_cannot_create_artist(client):
    await register_and_login(client)
    resp = await client.post("/artists", json={"name": "Soda Stereo"})
    assert resp.status_code == 403


async def test_create_list_search_get(client, session):
    await register_and_login(client, admin=True, session=session)

    resp = await client.post("/artists", json={"name": "Soda Stereo"})
    assert resp.status_code == 201, resp.text
    artist = resp.json()
    assert artist["name"] == "Soda Stereo"
    assert "id" in artist

    # Nombre duplicado -> 409
    resp = await client.post("/artists", json={"name": "Soda Stereo"})
    assert resp.status_code == 409

    # Búsqueda (case-insensitive)
    resp = await client.get("/artists", params={"q": "soda"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "Soda Stereo"

    # Get por id
    resp = await client.get(f"/artists/{artist['id']}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Soda Stereo"

    # Get inexistente -> 404
    import uuid

    resp = await client.get(f"/artists/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_update_and_delete_artist(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = (await client.post("/artists", json={"name": "Café Tacvba"})).json()

    resp = await client.patch(f"/artists/{artist['id']}", json={"name": "Café Tacuba"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Café Tacuba"

    resp = await client.delete(f"/artists/{artist['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/artists/{artist['id']}")
    assert resp.status_code == 404
