"""GET /me/playlists (Fase 5.5, 14.2): `song_ids` por playlist.

El PlaylistPicker necesita saber si una canción ya pertenece a cada playlist
del usuario. `MyPlaylistRead` expone `song_ids` ordenados por posición —
schema exclusivo de /me/playlists (no toca `PlaylistRead`).
"""

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
    # Toda canción requiere álbum (antes regla 14.1, ahora obligatorio).
    album = await _create_album(client, artist["id"], f"Álbum de {title}")
    resp = await client.post(
        "/songs",
        json={"title": title, "artist_id": artist["id"], "album_id": album["id"], "object_key": key},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_playlist(client, name: str = "Mi playlist", **extra) -> dict:
    resp = await client.post("/playlists", json={"name": name, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _add_song(client, playlist_id: str, song_id: str) -> None:
    resp = await client.post(
        f"/playlists/{playlist_id}/songs", json={"song_id": song_id}
    )
    assert resp.status_code == 200, resp.text


async def test_me_playlists_exposes_song_ids_in_position_order(client, session):
    """song_ids por playlist, respetando el orden de posición (0..n-1).

    Playlist A: [s1]; Playlist B: [s2, s1] (s1 compartida, en posición 1);
    Playlist C: vacía -> []. Cada canción tiene su álbum propio.
    """
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    s1 = await _create_song(client, "Uno", artist, f"songs/me-{uuid.uuid4().hex[:6]}-1.mp3")
    s2 = await _create_song(client, "Dos", artist, f"songs/me-{uuid.uuid4().hex[:6]}-2.mp3")

    await register_and_login(client)
    pl_a = await _create_playlist(client, "Playlist A")
    pl_b = await _create_playlist(client, "Playlist B")
    pl_empty = await _create_playlist(client, "Vacía")

    await _add_song(client, pl_a["id"], s1["id"])  # A: [s1]
    await _add_song(client, pl_b["id"], s2["id"])  # B: [s2]
    await _add_song(client, pl_b["id"], s1["id"])  # B: [s2, s1] — s1 compartida

    resp = await client.get("/me/playlists")
    assert resp.status_code == 200, resp.text
    by_id = {p["id"]: p for p in resp.json()}

    assert by_id[pl_a["id"]]["song_ids"] == [s1["id"]]
    assert by_id[pl_b["id"]]["song_ids"] == [s2["id"], s1["id"]]
    assert by_id[pl_empty["id"]]["song_ids"] == []
    # El resto del contrato de PlaylistRead se mantiene intacto
    assert by_id[pl_b["id"]]["song_count"] == 2
    assert "songs" not in by_id[pl_b["id"]]  # no arrastra el detalle completo


async def test_me_playlists_schema_does_not_leak_to_playlists(client, session):
    """El schema con song_ids es exclusivo de /me/playlists (no PlaylistRead)."""
    await register_and_login(client, admin=True, session=session)
    artist = await _create_artist(client, f"Artista {uuid.uuid4().hex[:6]}")
    song = await _create_song(client, "Tema", artist, f"songs/leak-{uuid.uuid4().hex[:6]}.mp3")

    await register_and_login(client)
    pl = await _create_playlist(client, "Para no filtrar")
    await _add_song(client, pl["id"], song["id"])

    resp = await client.get("/playlists")
    assert resp.status_code == 200, resp.text
    assert resp.json(), "el usuario tiene al menos su playlist"
    assert all("song_ids" not in p for p in resp.json())

    # El detalle de una playlist tampoco expone song_ids (usa PlaylistDetail)
    resp = await client.get(f"/playlists/{pl['id']}")
    assert resp.status_code == 200, resp.text
    assert "song_ids" not in resp.json()


async def test_me_playlists_requires_auth(client):
    resp = await client.get("/me/playlists")
    assert resp.status_code == 401
