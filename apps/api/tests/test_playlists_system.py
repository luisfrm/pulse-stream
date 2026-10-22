import uuid

import pytest

from tests.helpers import (
    add_listen,
    create_app_user,
    create_user_playlist,
    register_and_login,
)

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
    album = await _create_album(client, artist["id"], f"Álbum de {title}")
    resp = await client.post(
        "/songs",
        json={
            "title": title,
            "artist_id": artist["id"],
            "album_id": album["id"],
            "object_key": key,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_system_playlist_requires_admin(client, session):
    await register_and_login(client, session=session)  # cuenta de panel sin rol
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
    await add_listen(session, s1["id"])
    await add_listen(session, s2["id"])
    await add_listen(session, s1["id"])

    resp = await client.post(
        "/playlists/system",
        json={"name": "Top de la semana", "description": "Lo más sonado", "query": "top_week"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "system"
    assert body["is_public"] is True
    assert body["owner_email"] is None
    # La DB se comparte entre tests: asertamos presencia y orden (s1 > s2).
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
    await add_listen(session, song["id"])
    resp = await client.post(
        "/playlists/system", json={"name": "Feed system", "query": "top_week"}
    )
    assert resp.status_code == 201

    resp = await client.get("/playlists/public")
    items = resp.json()["items"]
    assert items[0]["kind"] == "system"
    assert items[0]["name"] == "Feed system"
    assert items[0]["owner_email"] is None


async def test_non_admin_cannot_mutate_system_playlist(client, session):
    # admin genera la playlist system
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/prot-{uuid.uuid4().hex[:6]}.mp3")
    await add_listen(session, song["id"])
    resp = await client.post(
        "/playlists/system", json={"name": "Protegida", "query": "top_week"}
    )
    system_id = resp.json()["id"]

    # otra cuenta de panel sin rol no la puede refrescar
    await register_and_login(client, session=session)
    resp = await client.post(f"/playlists/system/{system_id}/refresh")
    assert resp.status_code == 403


async def test_system_playlist_top_month_snapshot(client, session):
    """top_month: más reproducidas del mes calendario actual, por count desc."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    s1 = await _create_song(client, "Mes 1", artist, f"songs/m1-{uuid.uuid4().hex[:6]}.mp3")
    s2 = await _create_song(client, "Mes 2", artist, f"songs/m2-{uuid.uuid4().hex[:6]}.mp3")

    for song_id in [s1["id"], s2["id"], s1["id"], s2["id"], s1["id"]]:
        await add_listen(session, song_id)

    resp = await client.post(
        "/playlists/system",
        json={"name": "Top del mes", "query": "top_month"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["query"] == "top_month"
    ids = [s["id"] for s in body["songs"]]
    assert s1["id"] in ids and s2["id"] in ids
    assert ids.index(s1["id"]) < ids.index(s2["id"])


async def test_refresh_system_playlist_replaces_songs(client, session):
    """POST /playlists/system/{id}/refresh regenera el snapshot en la MISMA playlist."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    s1 = await _create_song(client, "Uno", artist, f"songs/r1-{uuid.uuid4().hex[:6]}.mp3")
    s2 = await _create_song(client, "Dos", artist, f"songs/r2-{uuid.uuid4().hex[:6]}.mp3")
    s3 = await _create_song(client, "Tres", artist, f"songs/r3-{uuid.uuid4().hex[:6]}.mp3")

    for song_id in [s1["id"], s2["id"]]:
        await add_listen(session, song_id)
    resp = await client.post(
        "/playlists/system", json={"name": "Top semanal", "query": "top_week"}
    )
    assert resp.status_code == 201, resp.text
    system_id = resp.json()["id"]
    ids_before = [s["id"] for s in resp.json()["songs"]]
    assert s3["id"] not in ids_before

    # s3 se vuelve la más escuchada
    for song_id in [s3["id"]] * 5:
        await add_listen(session, song_id)

    resp = await client.post(f"/playlists/system/{system_id}/refresh")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == system_id
    assert body["kind"] == "system"
    assert body["query"] == "top_week"
    ids_after = [s["id"] for s in body["songs"]]
    assert body["song_count"] == len(ids_after) == len(set(ids_after))
    assert s3["id"] in ids_after
    assert ids_after.index(s3["id"]) < ids_after.index(s1["id"])
    assert ids_after.index(s3["id"]) < ids_after.index(s2["id"])


async def test_refresh_system_playlist_requires_admin(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/ra-{uuid.uuid4().hex[:6]}.mp3")
    await add_listen(session, song["id"])
    resp = await client.post(
        "/playlists/system", json={"name": "Top", "query": "top_week"}
    )
    system_id = resp.json()["id"]

    await register_and_login(client, session=session)  # cuenta de panel sin rol
    resp = await client.post(f"/playlists/system/{system_id}/refresh")
    assert resp.status_code == 403


async def test_refresh_foreign_user_playlist_forbidden(client, session):
    """Una playlist de usuario solo la muta su dueño (el panel no es dueño)."""
    await register_and_login(client, admin=True, session=session)
    owner = await create_app_user(session)
    playlist = await create_user_playlist(
        session, owner_id=owner.id, name="Personal"
    )

    resp = await client.post(f"/playlists/system/{playlist.id}/refresh")
    assert resp.status_code == 403

    resp = await client.delete(f"/playlists/{playlist.id}")
    assert resp.status_code == 403


async def test_admin_can_delete_system_playlist(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    await _create_song(
        client, "Borrable", artist, f"songs/del-{uuid.uuid4().hex[:6]}.mp3"
    )
    resp = await client.post(
        "/playlists/system", json={"name": "Para borrar", "query": "new"}
    )
    assert resp.status_code == 201
    system_id = resp.json()["id"]

    resp = await client.delete(f"/playlists/{system_id}")
    assert resp.status_code == 204

    resp = await client.get("/playlists/public", params={"limit": 100})
    assert all(p["id"] != system_id for p in resp.json()["items"])


async def test_delete_system_playlist_requires_admin(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/playlists/system", json={"name": "Protegida del", "query": "new"}
    )
    system_id = resp.json()["id"]

    await register_and_login(client, session=session)  # sin rol
    resp = await client.delete(f"/playlists/{system_id}")
    assert resp.status_code == 403
