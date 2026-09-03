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


async def test_system_playlist_top_month_snapshot(client, session):
    """top_month: más reproducidas del mes calendario actual, por count desc.

    El dedupe de 30 s de /me/listens exige intercalar canciones para acumular
    plays de la misma canción (s1, s2, s1, s2, s1 -> s1=3, s2=2).
    """
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    s1 = await _create_song(client, "Mes 1", artist, f"songs/m1-{uuid.uuid4().hex[:6]}.mp3")
    s2 = await _create_song(client, "Mes 2", artist, f"songs/m2-{uuid.uuid4().hex[:6]}.mp3")

    for song_id in [s1["id"], s2["id"], s1["id"], s2["id"], s1["id"]]:
        resp = await client.post("/me/listens", json={"song_id": song_id})
        assert resp.status_code == 201, resp.text

    resp = await client.post(
        "/playlists/system",
        json={"name": "Top del mes", "query": "top_month"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["query"] == "top_month"
    ids = [s["id"] for s in body["songs"]]
    # s1 (3 plays) entra y va antes que s2 (2 plays)
    assert s1["id"] in ids and s2["id"] in ids
    assert ids.index(s1["id"]) < ids.index(s2["id"])


async def test_refresh_system_playlist_replaces_songs(client, session):
    """POST /playlists/system/{id}/refresh: regenera el snapshot en la MISMA
    playlist (mismo id, sin duplicar) con el ranking actualizado."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    s1 = await _create_song(client, "Uno", artist, f"songs/r1-{uuid.uuid4().hex[:6]}.mp3")
    s2 = await _create_song(client, "Dos", artist, f"songs/r2-{uuid.uuid4().hex[:6]}.mp3")
    s3 = await _create_song(client, "Tres", artist, f"songs/r3-{uuid.uuid4().hex[:6]}.mp3")

    # s1 x1, s2 x1 -> s3 sin plays no entra al snapshot
    for song_id in [s1["id"], s2["id"]]:
        await client.post("/me/listens", json={"song_id": song_id})
    resp = await client.post(
        "/playlists/system", json={"name": "Top semanal", "query": "top_week"}
    )
    assert resp.status_code == 201, resp.text
    system_id = resp.json()["id"]
    ids_before = [s["id"] for s in resp.json()["songs"]]
    assert s3["id"] not in ids_before

    # s3 se vuelve la más escuchada (intercalando para esquivar el dedupe)
    for song_id in [s3["id"], s1["id"], s3["id"], s2["id"], s3["id"], s1["id"], s3["id"]]:
        await client.post("/me/listens", json={"song_id": song_id})

    resp = await client.post(f"/playlists/system/{system_id}/refresh")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == system_id  # misma playlist, no se duplica
    assert body["kind"] == "system"
    assert body["query"] == "top_week"
    ids_after = [s["id"] for s in body["songs"]]
    # sin duplicados: song_count == len(ids)
    assert body["song_count"] == len(ids_after) == len(set(ids_after))
    # s3 entró y quedó primero (5 plays > 3 de s1 > 2 de s2)
    assert s3["id"] in ids_after
    assert ids_after.index(s3["id"]) < ids_after.index(s1["id"])
    assert ids_after.index(s3["id"]) < ids_after.index(s2["id"])


async def test_refresh_system_playlist_requires_admin(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/ra-{uuid.uuid4().hex[:6]}.mp3")
    await client.post("/me/listens", json={"song_id": song["id"]})
    resp = await client.post(
        "/playlists/system", json={"name": "Top", "query": "top_week"}
    )
    system_id = resp.json()["id"]

    await register_and_login(client)  # usuario normal
    resp = await client.post(f"/playlists/system/{system_id}/refresh")
    assert resp.status_code == 403


async def test_refresh_user_playlist_not_refreshable(client, session):
    """El refresh de una playlist de usuario (no system) -> 400."""
    await register_and_login(client, admin=True, session=session)
    resp = await client.post("/playlists", json={"name": "Personal"})
    assert resp.status_code == 201
    user_playlist_id = resp.json()["id"]

    resp = await client.post(f"/playlists/system/{user_playlist_id}/refresh")
    assert resp.status_code == 400
