import uuid

import pytest

from tests.helpers import login, register_and_login

pytestmark = pytest.mark.asyncio


async def _create_artist(client, name: str) -> dict:
    resp = await client.post("/artists", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_song(client, title: str, artist: dict, key: str, album: dict | None = None) -> dict:
    payload: dict = {"title": title, "artist_id": artist["id"], "object_key": key}
    if album is not None:
        payload["album_id"] = album["id"]
    resp = await client.post("/songs", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_album(client, artist: dict, title: str = "Álbum") -> dict:
    resp = await client.post(
        "/albums", json={"title": title, "artist_id": artist["id"]}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_playlist(client, name: str = "Mi playlist", **extra) -> dict:
    resp = await client.post("/playlists", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_like_unlike_albums(client, session):
    """PUT/DELETE/GET /me/favorites/albums: like, listado, ids y unlike."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    album = await _create_album(client, artist, "Disco Uno")
    await _create_song(client, "Tema Uno", artist, f"songs/{uuid.uuid4()}.mp3", album)

    await register_and_login(client)  # usuario normal
    # sin likes
    resp = await client.get("/me/favorites/albums")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0

    # like
    resp = await client.put(f"/me/favorites/albums/{album['id']}")
    assert resp.status_code == 204, resp.text

    resp = await client.get("/me/favorites/albums")
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["id"] == album["id"]
    assert resp.json()["items"][0]["title"] == "Disco Uno"
    assert resp.json()["items"][0]["song_count"] == 1

    # ids
    resp = await client.get("/me/favorites/albums/ids")
    assert resp.status_code == 200
    assert resp.json() == [album["id"]]

    # unlike
    resp = await client.delete(f"/me/favorites/albums/{album['id']}")
    assert resp.status_code == 204
    assert (await client.get("/me/favorites/albums")).json()["total"] == 0

    # unlike de un like inexistente -> 404
    resp = await client.delete(f"/me/favorites/albums/{album['id']}")
    assert resp.status_code == 404


async def test_favorite_album_nonexistent_404(client):
    await register_and_login(client)
    resp = await client.put(f"/me/favorites/albums/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_favorites_albums_require_auth(client):
    resp = await client.get("/me/favorites/albums")
    assert resp.status_code == 401
    resp = await client.put(f"/me/favorites/albums/{uuid.uuid4()}")
    assert resp.status_code == 401


async def test_like_unlike_playlists(client, session):
    """Like a una playlist pública de otro usuario: listado, ids y unlike."""
    await register_and_login(client)
    # Nombre único: la DB se comparte entre tests y el feed público indexa por
    # nombre en test_playlists.py (evitamos colisionar con "Pública de A").
    public = await _create_playlist(
        client, f"Pública de A {uuid.uuid4().hex[:6]}", is_public=True
    )

    await register_and_login(client)  # usuario B
    resp = await client.get("/me/favorites/playlists")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0

    resp = await client.put(f"/me/favorites/playlists/{public['id']}")
    assert resp.status_code == 204, resp.text

    resp = await client.get("/me/favorites/playlists")
    assert resp.json()["total"] == 1
    item = resp.json()["items"][0]
    assert item["id"] == public["id"]
    assert item["kind"] == "user"

    resp = await client.get("/me/favorites/playlists/ids")
    assert resp.status_code == 200
    assert resp.json() == [public["id"]]

    resp = await client.delete(f"/me/favorites/playlists/{public['id']}")
    assert resp.status_code == 204
    assert (await client.get("/me/favorites/playlists")).json()["total"] == 0

    resp = await client.delete(f"/me/favorites/playlists/{public['id']}")
    assert resp.status_code == 404


async def test_like_private_playlist_of_other_user_forbidden(client, session):
    await register_and_login(client)
    private = await _create_playlist(client, "Privada de A", is_public=False)

    await register_and_login(client)  # otro usuario
    resp = await client.put(f"/me/favorites/playlists/{private['id']}")
    assert resp.status_code == 403

    # la propia privada sí se puede marcar como favorita
    await register_and_login(client)
    mine = await _create_playlist(client, "Mi privada", is_public=False)
    resp = await client.put(f"/me/favorites/playlists/{mine['id']}")
    assert resp.status_code == 204


async def test_favorite_playlist_nonexistent_404(client):
    await register_and_login(client)
    resp = await client.put(f"/me/favorites/playlists/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_like_system_playlist_does_not_mutate_content(client, session):
    """Un usuario normal puede dar like a una playlist system, pero NO mutarla."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/sys-{uuid.uuid4().hex[:6]}.mp3")
    # query="new" (sin plays): no contamina el ranking global de /songs/popular
    # que test_listens.py asume vacío al correr antes que este archivo.
    resp = await client.post(
        "/playlists/system", json={"name": "Novedades", "query": "new"}
    )
    assert resp.status_code == 201, resp.text
    system_id = resp.json()["id"]
    assert resp.json()["query"] == "new"

    # usuario normal: like OK, mutar NO
    await register_and_login(client)
    resp = await client.put(f"/me/favorites/playlists/{system_id}")
    assert resp.status_code == 204

    resp = await client.post(f"/playlists/{system_id}/songs", json={"song_id": song["id"]})
    assert resp.status_code == 403
    resp = await client.patch(f"/playlists/{system_id}", json={"name": "Hackeada"})
    assert resp.status_code == 403

    # y aparece en su biblioteca con kind=system
    resp = await client.get("/me/favorites/playlists")
    items = resp.json()["items"]
    liked = next(p for p in items if p["id"] == system_id)
    assert liked["kind"] == "system"


async def test_library_ids_mixed(client, session):
    """GET /me/library/ids: los 3 sets (canciones, álbumes, playlists)."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/lib-{uuid.uuid4().hex[:6]}.mp3")
    album = await _create_album(client, artist, "Disco")

    await register_and_login(client)  # usuario normal
    resp = await client.get("/me/library/ids")
    assert resp.status_code == 200
    assert resp.json() == {"song_ids": [], "album_ids": [], "playlist_ids": []}

    playlist = await _create_playlist(client, "Mía")
    await client.put(f"/me/favorites/{song['id']}")
    await client.put(f"/me/favorites/albums/{album['id']}")
    await client.put(f"/me/favorites/playlists/{playlist['id']}")

    resp = await client.get("/me/library/ids")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"song_ids", "album_ids", "playlist_ids"}
    assert body["song_ids"] == [song["id"]]
    assert body["album_ids"] == [album["id"]]
    assert body["playlist_ids"] == [playlist["id"]]

    # quitar el like de la canción -> el set se actualiza
    await client.delete(f"/me/favorites/{song['id']}")
    resp = await client.get("/me/library/ids")
    assert resp.json()["song_ids"] == []


async def test_library_ids_require_auth(client):
    resp = await client.get("/me/library/ids")
    assert resp.status_code == 401


async def test_my_playlists_endpoint(client, session):
    """GET /me/playlists: solo las playlists del usuario actual."""
    user_a = await register_and_login(client)
    mine = await _create_playlist(client, "Mía")

    await register_and_login(client)  # B crea una pública
    await _create_playlist(client, "De otro", is_public=True)

    await login(client, user_a["email"])  # vuelvo a A
    resp = await client.get("/me/playlists")
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    names = [p["name"] for p in resp.json()]
    assert mine["id"] in ids
    assert "De otro" not in names