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


async def test_list_songs_filter_by_album_id(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Filter Album Artist")
    album_a = (
        await client.post(
            "/albums",
            json={"title": "Album A", "artist_id": artist["id"]},
        )
    ).json()
    album_b = (
        await client.post(
            "/albums",
            json={"title": "Album B", "artist_id": artist["id"]},
        )
    ).json()
    await client.post(
        "/songs",
        json={"title": "A1", "artist_id": artist["id"], "album_id": album_a["id"], "object_key": "songs/a1.mp3"},
    )
    await client.post(
        "/songs",
        json={"title": "A2", "artist_id": artist["id"], "album_id": album_a["id"], "object_key": "songs/a2.mp3"},
    )
    await client.post(
        "/songs",
        json={"title": "B1", "artist_id": artist["id"], "album_id": album_b["id"], "object_key": "songs/b1.mp3"},
    )

    resp = await client.get("/songs", params={"album_id": album_a["id"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert {s["title"] for s in data["items"]} == {"A1", "A2"}
    assert all(s["album"]["id"] == album_a["id"] for s in data["items"])


async def test_list_songs_filter_by_playlist_id(client, session):
    """Filtra por playlist en orden de posición (PlaylistSong.position)."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Filter Playlist Artist")
    playlist = (
        await client.post(
            "/playlists",
            json={"name": "Mi playlist", "is_public": False},
        )
    ).json()

    s1 = (
        await client.post(
            "/songs",
            json={"title": "Primera", "artist_id": artist["id"], "object_key": "songs/p1.mp3"},
        )
    ).json()
    s2 = (
        await client.post(
            "/songs",
            json={"title": "Segunda", "artist_id": artist["id"], "object_key": "songs/p2.mp3"},
        )
    ).json()
    s3 = (
        await client.post(
            "/songs",
            json={"title": "Tercera", "artist_id": artist["id"], "object_key": "songs/p3.mp3"},
        )
    ).json()
    # Cancion sin agregar a la playlist — no debe aparecer
    await client.post(
        "/songs",
        json={"title": "Fuera", "artist_id": artist["id"], "object_key": "songs/p4.mp3"},
    )

    for song_id in (s1["id"], s2["id"], s3["id"]):
        resp = await client.post(
            f"/playlists/{playlist['id']}/songs", json={"song_id": song_id}
        )
        assert resp.status_code == 200

    resp = await client.get("/songs", params={"playlist_id": playlist["id"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert [s["title"] for s in data["items"]] == ["Primera", "Segunda", "Tercera"]
