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


async def test_system_playlist_requires_admin(client, session):
    await register_and_login(client)  # usuario normal
    resp = await client.post(
        "/playlists/system", json={"name": "Top", "query": "top_week"}
    )
    assert resp.status_code == 403


async def test_create_system_playlist_snapshot(client, session):
    """Admin genera una playlist system: pública, kind=system, con canciones."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    s1 = await _create_song(client, "Uno", artist, f"songs/sys-{uuid.uuid4().hex[:6]}-1.mp3")
    s2 = await _create_song(client, "Dos", artist, f"songs/sys-{uuid.uuid4().hex[:6]}-2.mp3")

    # s1 se toca dos veces, s2 una -> top_week = [s1, s2]
    await client.post("/me/listens", json={"song_id": s1["id"]})
    await client.post("/me/listens", json={"song_id": s2["id"]})
    await client.post("/me/listens", json={"song_id": s1["id"]})

    resp = await client.post(
        "/playlists/system",
        json={"name": "Top de la semana", "description": "Lo más sonado", "query": "top_week"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "system"
    assert body["is_public"] is True
    # La DB se comparte entre tests: el snapshot trae las de esta corrida + las
    # de otros tests. Asertamos presencia, orden (s1 con más plays primero)
    # y que s1 > s2 por cantidad de reproducciones.
    ids = [s["id"] for s in body["songs"]]
    assert body["song_count"] >= 2
    assert s1["id"] in ids and s2["id"] in ids
    assert ids.index(s1["id"]) < ids.index(s2["id"])
    assert body["description"] == "Lo más sonado"


async def test_system_playlist_new_query(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    await _create_song(client, "Nueva", artist, f"songs/new-{uuid.uuid4().hex[:6]}.mp3")

    resp = await client.post(
        "/playlists/system", json={"name": "Recién agregadas", "query": "new"}
    )
    assert resp.status_code == 201
    assert resp.json()["song_count"] >= 1
    assert resp.json()["kind"] == "system"


async def test_system_playlist_public_feed_first(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/feed-{uuid.uuid4().hex[:6]}.mp3")
    await client.post("/me/listens", json={"song_id": song["id"]})
    resp = await client.post(
        "/playlists/system", json={"name": "Feed system", "query": "top_week"}
    )
    assert resp.status_code == 201

    # una playlist de usuario creada después
    await register_and_login(client)
    resp = await client.post(
        "/playlists", json={"name": "Feed user", "is_public": True}
    )
    assert resp.status_code == 201

    resp = await client.get("/playlists/public")
    items = resp.json()["items"]
    kinds = [p["kind"] for p in items]
    assert "system" in kinds
    # las system van primero en el feed
    assert items[0]["kind"] == "system"
    assert items[0]["name"] == "Feed system"


async def test_non_admin_cannot_mutate_system_playlist(client, session):
    # admin genera la playlist system
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/prot-{uuid.uuid4().hex[:6]}.mp3")
    await client.post("/me/listens", json={"song_id": song["id"]})
    resp = await client.post(
        "/playlists/system", json={"name": "Protegida", "query": "top_week"}
    )
    system_id = resp.json()["id"]

    # otro usuario (no dueño) no la puede tocar
    await register_and_login(client)
    resp = await client.patch(f"/playlists/{system_id}", json={"name": "Hackeada"})
    assert resp.status_code == 403
    resp = await client.delete(f"/playlists/{system_id}")
    assert resp.status_code == 403
    resp = await client.post(f"/playlists/{system_id}/songs", json={"song_id": song["id"]})
    assert resp.status_code == 403

    # pero sí puede verla (es pública)
    resp = await client.get(f"/playlists/{system_id}")
    assert resp.status_code == 200
