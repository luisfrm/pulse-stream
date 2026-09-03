import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def test_presign_cover_rejects_jpg(client, session):
    """Solo WebP: JPEG se rechaza (covers livianos para performance)."""
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.jpg", "content_type": "image/jpeg", "size": 100_000},
    )
    assert resp.status_code == 400
    assert "WebP" in resp.json()["detail"]


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
    # El PUT firma Cache-Control inmutable (navegador + CDN cachean por años)
    assert "cache-control" in body["url"].lower()


async def test_presign_cover_rejects_non_webp(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.png", "content_type": "image/png", "size": 100_000},
    )
    assert resp.status_code == 400
    assert "WebP" in resp.json()["detail"]


async def test_presign_cover_rejects_oversize(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.webp", "content_type": "image/webp", "size": 257 * 1024},
    )
    assert resp.status_code == 400
    assert "256 KB" in resp.json()["detail"]


async def test_song_cover_inherits_album(client, session):
    """La canción no tiene cover propio: hereda el del álbum."""
    await register_and_login(client, admin=True, session=session)
    artist = (
        await client.post("/artists", json={"name": "Los Covers"})
    ).json()
    # Keys con formato del presign (`covers/{uuid}.webp`): el schema exige el
    # patrón estricto en escritura.
    album_key = "covers/11111111-1111-4111-8111-111111111111.webp"
    artist_key = "covers/22222222-2222-4222-8222-222222222222.webp"
    album = (
        await client.post(
            "/albums",
            json={"title": "Disco", "artist_id": artist["id"], "cover_key": album_key},
        )
    ).json()
    song = (
        await client.post(
            "/songs",
            json={"title": "Con Portada", "artist_id": artist["id"], "album_id": album["id"], "object_key": "songs/cov.mp3"},
        )
    ).json()
    assert "cover_key" not in song
    assert song["cover_url"] is not None
    assert song["cover_url"].endswith(f"/{album_key}")

    # asignar cover al artista sigue funcionando
    resp = await client.patch(
        f"/artists/{artist['id']}", json={"cover_key": artist_key}
    )
    assert resp.status_code == 200
    assert resp.json()["cover_key"] == artist_key


async def test_cover_key_strict_pattern_rejected_on_write(client, session):
    """El bypass por PATCH/POST directo con key arbitraria es 422 (webp-only).

    Solo pasan keys con formato del presign (`covers/{uuid}.webp`); la
    lectura no valida (una fila legacy con key vieja sigue leyéndose).
    """
    await register_and_login(client, admin=True, session=session)
    artist = (
        await client.post("/artists", json={"name": "Patrón Estricto"})
    ).json()

    # POST álbum con .jpg → 422
    resp = await client.post(
        "/albums",
        json={
            "title": "Disco",
            "artist_id": artist["id"],
            "cover_key": "covers/uvst.jpg",
        },
    )
    assert resp.status_code == 422, resp.text

    # POST álbum con .webp pero sin UUID → 422
    resp = await client.post(
        "/albums",
        json={
            "title": "Disco",
            "artist_id": artist["id"],
            "cover_key": "covers/album1.webp",
        },
    )
    assert resp.status_code == 422, resp.text

    # PATCH artista con .jpg → 422
    resp = await client.patch(
        f"/artists/{artist['id']}", json={"cover_key": "covers/artist1.jpg"}
    )
    assert resp.status_code == 422, resp.text

    # PATCH playlist con key arbitraria → 422
    pl = (await client.post("/playlists", json={"name": "Pl"})).json()
    resp = await client.patch(
        f"/playlists/{pl['id']}", json={"cover_key": "covers/x.jpg"}
    )
    assert resp.status_code == 422, resp.text

    # PATCH perfil con .jpg → 422
    resp = await client.patch("/users/me", json={"cover_key": "covers/p.jpg"})
    assert resp.status_code == 422, resp.text


async def test_presign_cover_requires_auth(client):
    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "c.webp", "content_type": "image/webp", "size": 10},
    )
    assert resp.status_code == 401
