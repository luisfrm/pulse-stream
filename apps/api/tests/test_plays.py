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


async def _seed(client, session, n: int = 3) -> list[dict]:
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    songs = [
        await _create_song(
            client, f"Canción {i}", artist, f"songs/plays-{uuid.uuid4().hex[:6]}-{i}.mp3"
        )
        for i in range(n)
    ]
    return songs


async def test_play_increments_song_play_count(client, session):
    """Cada play suma +1 a `play_count`; el dedupe de 30 s no suma doble."""
    await register_and_login(client)
    [song] = await _seed(client, session, n=1)

    resp = await client.get(f"/songs/{song['id']}")
    assert resp.json()["play_count"] == 0

    # dos plays consecutivos de la misma canción en <30 s -> 1 play real
    await client.post("/me/listens", json={"song_id": song["id"]})
    await client.post("/me/listens", json={"song_id": song["id"]})
    resp = await client.get(f"/songs/{song['id']}")
    assert resp.json()["play_count"] == 1

    # una segunda canción y volver: ya no es consecutivo -> suma de nuevo
    [s2] = await _seed(client, session, n=1)
    await client.post("/me/listens", json={"song_id": s2["id"]})
    await client.post("/me/listens", json={"song_id": song["id"]})
    resp = await client.get(f"/songs/{song['id']}")
    assert resp.json()["play_count"] == 2


async def test_play_increments_user_total_plays(client, session):
    await register_and_login(client)
    [s1, s2] = await _seed(client, session, n=2)

    resp = await client.get("/users/me")
    assert resp.json()["total_plays"] == 0

    for song in (s1, s2):
        await client.post("/me/listens", json={"song_id": song["id"]})

    resp = await client.get("/users/me")
    assert resp.json()["total_plays"] == 2


async def test_recently_played_includes_user_play_count(client, session):
    """Cada item del historial trae cuántas veces lo tocó el usuario."""
    await register_and_login(client)
    s1, s2, s3 = await _seed(client, session, n=3)

    # s1 se toca dos veces (no consecutivas), s2 una, s3 una
    for song in (s1, s2, s1, s3):
        await client.post("/me/listens", json={"song_id": song["id"]})

    resp = await client.get("/me/recently-played")
    assert resp.status_code == 200
    by_id = {item["id"]: item for item in resp.json()["items"]}
    assert by_id[s1["id"]]["user_play_count"] == 2
    assert by_id[s2["id"]]["user_play_count"] == 1
    assert by_id[s3["id"]]["user_play_count"] == 1


async def test_popular_supports_month_window(client, session):
    """`month=true` usa el mes calendario actual: los plays de recién entran."""
    await register_and_login(client)
    s1, s2, s3 = await _seed(client, session, n=3)
    for song in (s1, s2, s3):
        await client.post("/me/listens", json={"song_id": song["id"]})

    resp = await client.get("/songs/popular", params={"month": True})
    assert resp.status_code == 200
    items = resp.json()
    # La DB se comparte entre tests: el ranking trae canciones de toda la
    # corrida; asertamos que las 3 de esta prueba están dentro del top.
    ranking_ids = {s["id"] for s in items}
    assert {s1["id"], s2["id"], s3["id"]}.issubset(ranking_ids)
