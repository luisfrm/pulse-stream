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


async def _create_playlist(client, name: str = "Mi playlist", **extra) -> dict:
    resp = await client.post("/playlists", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_and_list_playlists(client, session):
    user = await register_and_login(client)
    pl = await _create_playlist(client, "Gimnasio")
    assert pl["name"] == "Gimnasio"
    assert pl["is_public"] is False
    assert pl["song_count"] == 0
    assert "owner" not in pl  # no exponemos al owner

    resp = await client.get("/playlists")
    assert resp.status_code == 200
    items = resp.json()
    assert any(p["id"] == pl["id"] for p in items)
    assert user["id"]  # el owner es el usuario autenticado


async def test_add_and_remove_songs_with_order(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, "Cerati")
    s1 = await _create_song(client, "Crimen", artist, "songs/c1.mp3")
    s2 = await _create_song(client, "Adiós", artist, "songs/c2.mp3")

    # usuario normal crea la playlist
    await register_and_login(client)
    pl = await _create_playlist(client, "Favoritas de Cerati")

    # agregar canciones en orden
    resp = await client.post(f"/playlists/{pl['id']}/songs", json={"song_id": s1["id"]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["song_count"] == 1
    assert [s["title"] for s in resp.json()["songs"]] == ["Crimen"]

    resp = await client.post(f"/playlists/{pl['id']}/songs", json={"song_id": s2["id"]})
    assert resp.json()["song_count"] == 2
    assert [s["title"] for s in resp.json()["songs"]] == ["Crimen", "Adiós"]

    # no-op si ya está
    resp = await client.post(f"/playlists/{pl['id']}/songs", json={"song_id": s1["id"]})
    assert resp.json()["song_count"] == 2

    # get detalle con canciones ordenadas
    resp = await client.get(f"/playlists/{pl['id']}")
    assert resp.status_code == 200
    assert [s["title"] for s in resp.json()["songs"]] == ["Crimen", "Adiós"]

    # quitar la primera -> la segunda queda en posición 0
    resp = await client.delete(f"/playlists/{pl['id']}/songs/{s1['id']}")
    assert resp.status_code == 200
    assert [s["title"] for s in resp.json()["songs"]] == ["Adiós"]


async def test_add_nonexistent_song_404(client, session):
    await register_and_login(client)
    pl = await _create_playlist(client)
    resp = await client.post(
        f"/playlists/{pl['id']}/songs", json={"song_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 404


async def test_playlist_access_rules(client, session):
    """Privada: solo el dueño. Pública: visible para otros."""
    await register_and_login(client)
    private = await _create_playlist(client, "Privada", is_public=False)
    public = await _create_playlist(client, "Pública", is_public=True)

    # otro usuario no ve la privada del primero
    await register_and_login(client)
    resp = await client.get(f"/playlists/{private['id']}")
    assert resp.status_code == 403

    resp = await client.get(f"/playlists/{public['id']}")
    assert resp.status_code == 200

    # otro usuario no puede modificar la ajena
    resp = await client.patch(f"/playlists/{public['id']}", json={"name": "Hackeada"})
    assert resp.status_code == 403
    resp = await client.delete(f"/playlists/{public['id']}")
    assert resp.status_code == 403


async def test_update_and_delete_playlist(client, session):
    await register_and_login(client)
    pl = await _create_playlist(client, "Viejo nombre")

    resp = await client.patch(
        f"/playlists/{pl['id']}",
        json={"name": "Nuevo nombre", "is_public": True, "cover_key": "covers/x.jpg"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Nuevo nombre"
    assert body["is_public"] is True
    assert body["cover_key"] == "covers/x.jpg"
    assert body["cover_url"] is None or body["cover_url"].endswith("/covers/x.jpg")

    resp = await client.delete(f"/playlists/{pl['id']}")
    assert resp.status_code == 204
    resp = await client.get(f"/playlists/{pl['id']}")
    assert resp.status_code == 404


async def test_playlist_requires_auth(client):
    resp = await client.get("/playlists")
    assert resp.status_code == 401
    resp = await client.post("/playlists", json={"name": "X"})
    assert resp.status_code == 401
