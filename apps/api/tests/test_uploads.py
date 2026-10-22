import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio

VALID = {"filename": "cancion.mp3", "content_type": "audio/mpeg", "size": 1024 * 1024}


async def test_presign_requires_auth(client):
    resp = await client.post("/uploads/presign", json=VALID)
    assert resp.status_code == 401


async def test_presign_requires_admin_role(client, session):
    """Una cuenta del panel con role=NULL no puede firmar uploads."""
    await register_and_login(client, session=session)
    resp = await client.post("/uploads/presign", json=VALID)
    assert resp.status_code == 403

    resp = await client.post(
        "/uploads/presign-cover",
        json={"filename": "cover.webp", "content_type": "image/webp", "size": 1024},
    )
    assert resp.status_code == 403


async def test_presign_invalid_content_type(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign",
        json={**VALID, "content_type": "video/mp4", "filename": "clip.mp4"},
    )
    assert resp.status_code == 400
    assert "audio/mpeg" in resp.json()["detail"]


async def test_presign_too_large(client, session):
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign", json={**VALID, "size": 200 * 1024 * 1024}
    )
    assert resp.status_code == 400
    assert "tamaño máximo" in resp.json()["detail"]


async def test_presign_aac(client, session):
    """AAC (audio/aac) es válido y firma un object_key .aac."""
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign",
        json={"filename": "tema.aac", "content_type": "audio/aac", "size": 1024 * 1024},
    )

    if resp.status_code == 503:
        assert "R2" in resp.json()["detail"]
        return

    assert resp.status_code == 200, resp.text
    assert resp.json()["object_key"].endswith(".aac")


async def test_presign_aac_dlna(client, session):
    """AAC reportado como ADTS/DLNA (lo que mandan los navegadores para .aac)."""
    await register_and_login(client, admin=True, session=session)
    resp = await client.post(
        "/uploads/presign",
        json={
            "filename": "tema.aac",
            "content_type": "audio/vnd.dlna.adts",
            "size": 1024 * 1024,
        },
    )

    if resp.status_code == 503:
        assert "R2" in resp.json()["detail"]
        return

    assert resp.status_code == 200, resp.text
    assert resp.json()["object_key"].endswith(".aac")


async def test_presign_behavior(client, session):
    """Sin R2 configurado -> 503 con mensaje claro; con R2 -> URL firmada válida."""
    await register_and_login(client, admin=True, session=session)
    resp = await client.post("/uploads/presign", json=VALID)

    if resp.status_code == 503:
        assert "R2" in resp.json()["detail"]
        return

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["object_key"].startswith("songs/")
    assert data["object_key"].endswith(".mp3")
    assert data["expires_in"] > 0
    assert "X-Amz-Signature" in data["url"]
    assert "X-Amz-Credential" in data["url"]
