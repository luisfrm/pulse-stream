import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio

VALID = {"filename": "cancion.mp3", "content_type": "audio/mpeg", "size": 1024 * 1024}


async def test_presign_requires_auth(client):
    resp = await client.post("/uploads/presign", json=VALID)
    assert resp.status_code == 401


async def test_presign_invalid_content_type(client):
    await register_and_login(client)
    resp = await client.post(
        "/uploads/presign",
        json={**VALID, "content_type": "video/mp4", "filename": "clip.mp4"},
    )
    assert resp.status_code == 400
    assert "audio/mpeg" in resp.json()["detail"]


async def test_presign_too_large(client):
    await register_and_login(client)
    resp = await client.post(
        "/uploads/presign", json={**VALID, "size": 200 * 1024 * 1024}
    )
    assert resp.status_code == 400
    assert "tamaño máximo" in resp.json()["detail"]


async def test_presign_behavior(client):
    """Sin R2 configurado -> 503 con mensaje claro; con R2 -> URL firmada válida."""
    await register_and_login(client)
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
