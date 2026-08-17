import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def test_presign_cover_accepts_jpg(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.jpg", "content_type": "image/jpeg", "size": 100_000},
    )
    if resp.status_code == 503:
        pytest.skip("R2 no configurado en este entorno (test de comportamiento)")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["object_key"].startswith("covers/")
    assert body["object_key"].endswith(".jpg")
    assert "X-Amz-Signature" in body["url"]


async def test_presign_cover_accepts_webp(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.webp", "content_type": "image/webp", "size": 100_000},
    )
    if resp.status_code == 503:
        pytest.skip("R2 no configurado en este entorno (test de comportamiento)")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["object_key"].startswith("covers/")
    assert body["object_key"].endswith(".webp")
    assert "X-Amz-Signature" in body["url"]


async def test_presign_cover_rejects_non_jpg(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.png", "content_type": "image/png", "size": 100_000},
    )
    assert resp.status_code == 400
    assert "JPG" in resp.json()["detail"]


async def test_presign_cover_rejects_oversize(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.jpg", "content_type": "image/jpeg", "size": 513 * 1024},
    )
    assert resp.status_code == 400
    assert "512 KB" in resp.json()["detail"]


async def test_assign_cover_to_song_and_artist(client, session):
    await register_and_login(client, admin=True, session=session)
    artist = (
        await client.post("/artists", json={"name": "Los Covers"})
    ).json()
    song = (
        await client.post(
            "/songs",
            json={"title": "Con Portada", "artist_id": artist["id"], "object_key": "songs/cov.mp3"},
        )
    ).json()

    # asignar cover al artista
    resp = await client.patch(
        f"/artists/{artist['id']}", json={"cover_key": "covers/artist1.jpg"}
    )
    assert resp.status_code == 200
    assert resp.json()["cover_key"] == "covers/artist1.jpg"

    # asignar cover a la canción
    resp = await client.patch(
        f"/songs/{song['id']}", json={"cover_key": "covers/song1.jpg"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cover_key"] == "covers/song1.jpg"
    assert body["cover_url"] is None or body["cover_url"].endswith("/covers/song1.jpg")


async def test_presign_cover_requires_auth(client):
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "c.jpg", "content_type": "image/jpeg", "size": 10},
    )
    assert resp.status_code == 401
