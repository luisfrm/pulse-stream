import uuid

import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def _create_artist(client, name: str) -> dict:
    resp = await client.post("/artists", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_song_with_existing_artist(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Gustavo Cerati")

    resp = await client.post(
        "/songs",
        json={
            "title": "Crimen",
            "artist_id": artist["id"],
            "genres": ["rock", "pop"],
            "object_key": "songs/abc.mp3",
            "lyrics": "Un crimen...",
            "duration_seconds": 250,
        },
    )
    assert resp.status_code == 201, resp.text
    song = resp.json()
    assert song["title"] == "Crimen"
    assert song["artist"]["name"] == "Gustavo Cerati"
    assert song["genres"] == ["rock", "pop"]
    assert song["lyrics"] == "Un crimen..."
    assert song["duration_seconds"] == 250
    # stream_url: None (sin R2_PUBLIC_BASE_URL) o URL pública del objeto
    assert song["stream_url"] is None or song["stream_url"].endswith(
        f"/{song['object_key']}"
    )


async def test_create_song_with_inline_artist(client, session):
    """Regla del plan: `artist_name` sin `artist_id` crea el artista primero."""
    await register_and_login(client, admin=True, session=session)

    resp = await client.post(
        "/songs",
        json={
            "title": "De Música Ligera",
            "artist_name": "Soda Stereo",
            "genres": ["rock"],
            "object_key": "songs/def.mp3",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["artist"]["name"] == "Soda Stereo"

    # El artista quedó creado en la misma operación
    resp = await client.get("/artists", params={"q": "soda"})
    assert resp.json()["total"] == 1


async def test_create_song_reuses_existing_inline_artist(client, session):
    # Nombre único por corrida: los tests comparten la DB y los artistas son únicos
    name = f"Soda Stereo {uuid.uuid4().hex[:6]}"
    await register_and_login(client, admin=True, session=session)
    await _create_artist(client, name)

    resp = await client.post(
        "/songs",
        json={"title": "Nada Personal", "artist_name": name.lower(), "object_key": "songs/ghi.mp3"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["artist"]["name"] == name

    resp = await client.get("/artists", params={"q": name})
    assert resp.json()["total"] == 1  # no duplicó el artista


async def test_create_song_without_artist_rejected(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/songs", json={"title": "X", "object_key": "songs/x.mp3"}
    )
    assert resp.status_code == 422


async def test_create_song_invalid_genre_rejected(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Algo")
    resp = await client.post(
        "/songs",
        json={
            "title": "X",
            "artist_id": artist["id"],
            "genres": ["reggae-no-existe"],
            "object_key": "songs/x.mp3",
        },
    )
    assert resp.status_code == 422


async def test_create_song_invalid_artist_id(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/songs",
        json={"title": "X", "artist_id": str(uuid.uuid4()), "object_key": "songs/x.mp3"},
    )
    assert resp.status_code == 404


async def test_normal_user_cannot_create_song(client):
    await register_and_login(client)
    resp = await client.post(
        "/songs",
        json={"title": "X", "artist_name": "A", "object_key": "songs/x.mp3"},
    )
    assert resp.status_code == 403


async def test_list_search_get_update_delete(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Queen")
    song = (
        await client.post(
            "/songs",
            json={"title": "Bohemian Rhapsody", "artist_id": artist["id"], "object_key": "songs/queen1.mp3"},
        )
    ).json()

    # Listado + búsqueda por título
    resp = await client.get("/songs", params={"q": "bohemian"})
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["artist"]["name"] == "Queen"

    # Get por id
    resp = await client.get(f"/songs/{song['id']}")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Bohemian Rhapsody"

    # Update
    resp = await client.patch(
        f"/songs/{song['id']}", json={"title": "Bohemian Rhapsody (Live)"}
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Bohemian Rhapsody (Live)"

    # Delete -> 404 después
    resp = await client.delete(f"/songs/{song['id']}")
    assert resp.status_code == 204
    resp = await client.get(f"/songs/{song['id']}")
    assert resp.status_code == 404
