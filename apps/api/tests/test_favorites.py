import uuid

import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def _create_artist(client, name: str) -> dict:
    resp = await client.post("/artists", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_song(client, title: str, artist: dict, key: str) -> dict:
    resp = await client.post(
        "/songs",
        json={"title": title, "artist_id": artist["id"], "object_key": key},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_songs(client, session) -> list[dict]:
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Soda Stereo")
    songs = []
    for i, title in enumerate(["De Música Ligera", "Nada Personal", "Persiana Americana"]):
        songs.append(await _create_song(client, title, artist, f"songs/soda{i}.mp3"))
    return songs


async def test_add_list_remove_favorites(client, session):
    songs = await _seed_songs(client, session)
    await register_and_login(client)  # usuario normal

    # sin favoritos
    resp = await client.get("/me/favorites")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0

    # agregar dos
    for song in songs[:2]:
        resp = await client.put(f"/me/favorites/{song['id']}")
        assert resp.status_code == 204, resp.text

    resp = await client.get("/me/favorites")
    assert resp.json()["total"] == 2
    titles = {s["title"] for s in resp.json()["items"]}
    assert titles == {"De Música Ligera", "Nada Personal"}

    # ids
    resp = await client.get("/me/favorites/ids")
    assert resp.status_code == 200
    assert set(resp.json()) == {songs[0]["id"], songs[1]["id"]}

    # quitar
    resp = await client.delete(f"/me/favorites/{songs[0]['id']}")
    assert resp.status_code == 204
    resp = await client.get("/me/favorites")
    assert resp.json()["total"] == 1

    # quitar inexistente -> 404
    resp = await client.delete(f"/me/favorites/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_favorite_nonexistent_song_404(client):
    await register_and_login(client)
    resp = await client.put(f"/me/favorites/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_favorites_require_auth(client):
    resp = await client.get("/me/favorites")
    assert resp.status_code == 401
