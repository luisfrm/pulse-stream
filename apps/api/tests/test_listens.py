import uuid

import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def _create_artist(client, name: str) -> dict:
    resp = await client.post("/artists", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_album(client, artist_id: str, title: str = "Álbum") -> dict:
    resp = await client.post(
        "/albums", json={"title": title, "artist_id": artist_id}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_song(client, title: str, artist: dict, key: str) -> dict:
    # Toda canción requiere álbum: uno por defecto si no se indica.
    album = await _create_album(client, artist["id"], f"Álbum de {title}")
    resp = await client.post(
        "/songs",
        json={"title": title, "artist_id": artist["id"], "album_id": album["id"], "object_key": key},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_songs(client, session, n: int = 3) -> list[dict]:
    """Crea un admin + n canciones y devuelve la lista (recientes primero)."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    songs = []
    for i in range(n):
        songs.append(
            await _create_song(
                client, f"Canción {i}", artist, f"songs/listens-{uuid.uuid4().hex[:6]}-{i}.mp3"
            )
        )
    return songs


async def test_record_play(client, session):
    await register_and_login(client)
    [song] = await _seed_songs(client, session, n=1)

    resp = await client.post("/me/listens", json={"song_id": song["id"]})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["song_id"] == song["id"]
    assert "played_at" in body
    assert "id" in body


async def test_record_play_requires_auth(client):
    resp = await client.post("/me/listens", json={"song_id": str(uuid.uuid4())})
    assert resp.status_code == 401


async def test_record_play_nonexistent_song_404(client, session):
    await register_and_login(client)
    resp = await client.post("/me/listens", json={"song_id": str(uuid.uuid4())})
    assert resp.status_code == 404


async def test_record_play_dedupes_within_window(client, session):
    """Dos POST del mismo play en <30 s -> una sola fila en el historial."""
    await register_and_login(client)
    [song] = await _seed_songs(client, session, n=1)

    first = await client.post("/me/listens", json={"song_id": song["id"]})
    assert first.status_code == 201
    second = await client.post("/me/listens", json={"song_id": song["id"]})
    assert second.status_code == 201

    resp = await client.get("/me/recently-played")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1  # deduplicado


async def test_recently_played_distinct_ordered(client, session):
    """Canciones sin duplicar, la última reproducida primero."""
    await register_and_login(client)
    s1, s2, s3 = await _seed_songs(client, session, n=3)

    # Orden de reproducción: s1, s2, s1, s3 -> recientes: s3, s1, s2
    for song in (s1, s2, s1, s3):
        resp = await client.post("/me/listens", json={"song_id": song["id"]})
        assert resp.status_code == 201

    resp = await client.get("/me/recently-played")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [s["id"] for s in items] == [s3["id"], s1["id"], s2["id"]]
    # payload completo (artist incluido) para pintar cards sin más fetches
    assert items[0]["artist"]["name"]


async def test_recently_played_paginates(client, session):
    await register_and_login(client)
    songs = await _seed_songs(client, session, n=3)
    for song in songs:
        await client.post("/me/listens", json={"song_id": song["id"]})

    resp = await client.get("/me/recently-played", params={"limit": 2, "offset": 0})
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2


async def test_popular_ranked_by_plays(client, session):
    """/songs/popular: las más reproducidas primero, con play_count."""
    await register_and_login(client)
    s1, s2, s3 = await _seed_songs(client, session, n=3)

    # s1 se toca 3 veces no consecutivas, s2 dos, s3 ninguna
    for song in (s1, s2, s1, s2, s1):
        await client.post("/me/listens", json={"song_id": song["id"]})

    resp = await client.get("/songs/popular")
    assert resp.status_code == 200
    items = resp.json()
    # El ranking incluye solo canciones con plays: s1 (3) > s2 (2)
    assert len(items) == 2
    assert items[0]["id"] == s1["id"]
    assert items[0]["play_count"] == 3
    assert items[1]["id"] == s2["id"]
    assert items[1]["play_count"] == 2


async def test_popular_respects_limit_and_days(client, session):
    await register_and_login(client)
    s1, s2, s3 = await _seed_songs(client, session, n=3)
    for song in (s1, s2, s3):
        await client.post("/me/listens", json={"song_id": song["id"]})

    resp = await client.get("/songs/popular", params={"limit": 2})
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    # Ventana de 1 día incluye los plays de recién (misma corrida)
    resp = await client.get("/songs/popular", params={"days": 1})
    assert resp.status_code == 200
    assert len(resp.json()) == 3