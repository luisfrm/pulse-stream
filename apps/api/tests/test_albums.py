import uuid

import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def _create_artist(client, name: str) -> dict:
    resp = await client.post("/artists", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_album(client, artist: dict, title: str = "Álbum") -> dict:
    resp = await client.post(
        "/albums", json={"title": title, "artist_id": artist["id"]}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_song(
    client, title: str, artist: dict, key: str, **extra
) -> dict:
    resp = await client.post(
        "/songs",
        json={"title": title, "artist_id": artist["id"], "object_key": key, **extra},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_album_requires_admin(client, session):
    # sin sesión -> 401; usuario normal -> 403
    resp = await client.post(
        "/albums", json={"title": "X", "artist_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 401

    await register_and_login(client)  # usuario normal
    resp = await client.post(
        "/albums", json={"title": "X", "artist_id": str(uuid.uuid4())}
    )
    assert resp.status_code == 403

    # el listado es público (catálogo)
    resp = await client.get("/albums")
    assert resp.status_code == 200


async def test_album_with_songs_and_detail(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    album = await _create_album(client, artist, "Disco Uno")
    assert album["title"] == "Disco Uno"
    assert album["song_count"] == 0
    assert album["artist"]["id"] == artist["id"]

    s1 = await _create_song(client, "Tema 1", artist, f"songs/a1-{uuid.uuid4().hex[:6]}.mp3", album_id=album["id"])
    s2 = await _create_song(client, "Tema 2", artist, f"songs/a2-{uuid.uuid4().hex[:6]}.mp3", album_id=album["id"])

    resp = await client.get(f"/albums/{album['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["song_count"] == 2
    assert [s["id"] for s in body["songs"]] == [s1["id"], s2["id"]]
    # la canción conoce su álbum (con su artista)
    resp = await client.get(f"/songs/{s1['id']}")
    assert resp.json()["album"]["id"] == album["id"]
    assert resp.json()["album"]["artist"]["id"] == artist["id"]


async def test_album_list_and_filter(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    other = await _create_artist(client, f"Otro {uuid.uuid4().hex[:6]}")
    await _create_album(client, artist, "Mío")
    await _create_album(client, other, "De otro")

    resp = await client.get("/albums", params={"artist_id": artist["id"]})
    assert resp.status_code == 200
    titles = [a["title"] for a in resp.json()["items"]]
    assert "Mío" in titles
    assert "De otro" not in titles


async def test_delete_album_sets_song_album_null(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    album = await _create_album(client, artist)
    song = await _create_song(
        client, "Tema", artist, f"songs/del-{uuid.uuid4().hex[:6]}.mp3", album_id=album["id"]
    )

    resp = await client.delete(f"/albums/{album['id']}")
    assert resp.status_code == 204

    # la canción sobrevive, sin álbum
    resp = await client.get(f"/songs/{song['id']}")
    assert resp.status_code == 200
    assert resp.json()["album"] is None


async def test_song_collaborators_and_artist_collaborations(client, session):
    await register_and_login(client, admin=True, session=session)
    main = await _create_artist(client, f"Principal {uuid.uuid4().hex[:6]}")
    guest = await _create_artist(client, f"Invitado {uuid.uuid4().hex[:6]}")
    other = await _create_artist(client, f"Otro {uuid.uuid4().hex[:6]}")

    song = await _create_song(
        client,
        "Feat.",
        main,
        f"songs/feat-{uuid.uuid4().hex[:6]}.mp3",
        collaborator_ids=[guest["id"]],
    )

    # la canción expone sus colaboradores
    resp = await client.get(f"/songs/{song['id']}")
    assert resp.status_code == 200
    collab_names = [a["name"] for a in resp.json()["collaborators"]]
    assert collab_names == [guest["name"]]

    # filtro de colaboraciones: el invitado aparece, el principal NO en su
    # sección de colaboraciones (es su canción principal), y un tercero nada
    resp = await client.get("/songs", params={"collaborator_id": guest["id"]})
    assert [s["id"] for s in resp.json()["items"]] == [song["id"]]
    resp = await client.get("/songs", params={"collaborator_id": main["id"]})
    assert resp.json()["items"] == []
    resp = await client.get("/songs", params={"collaborator_id": other["id"]})
    assert resp.json()["items"] == []

    # el artista principal sí la tiene en sus canciones
    resp = await client.get("/songs", params={"artist_id": main["id"]})
    assert [s["id"] for s in resp.json()["items"]] == [song["id"]]
