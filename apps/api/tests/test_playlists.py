"""Feed público de playlists (el panel ya no expone CRUD de playlists de usuario)."""

import uuid

import pytest

from app.features.users.models import SYSTEM_USER_ID
from tests.helpers import create_app_user, create_user_playlist, register_and_login

pytestmark = pytest.mark.asyncio


async def _create_system_playlist(client, name: str, query: str = "new") -> dict:
    resp = await client.post(
        "/playlists/system", json={"name": name, "query": query}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_public_feed_lists_all_community_playlists(client, session):
    """GET /playlists/public: públicas de TODOS, con autor y system primero."""
    admin = await register_and_login(client, admin=True, session=session)

    user_a = await create_app_user(session)
    await create_user_playlist(
        session, owner_id=user_a.id, name="Pública de A", is_public=True
    )
    await create_user_playlist(
        session, owner_id=user_a.id, name="Privada de A", is_public=False
    )

    user_b = await create_app_user(session)
    await create_user_playlist(
        session, owner_id=user_b.id, name="Pública de B", is_public=True
    )

    system = await _create_system_playlist(
        client, f"Sistema {uuid.uuid4().hex[:6]}", query="new"
    )
    assert system["owner_email"] is None

    resp = await client.get("/playlists/public", params={"limit": 100})
    assert resp.status_code == 200
    body = resp.json()
    names = [p["name"] for p in body["items"]]

    assert "Pública de A" in names
    assert "Pública de B" in names
    assert "Privada de A" not in names

    by_name = {p["name"]: p for p in body["items"]}
    assert by_name["Pública de A"]["owner_email"] == user_a.email
    assert by_name["Pública de B"]["owner_email"] == user_b.email
    # El email interno del usuario de sistema NUNCA se expone.
    assert by_name[system["name"]]["owner_email"] is None

    # Las system van primero en el feed.
    kinds = [p["kind"] for p in body["items"]]
    assert kinds.index("system") < kinds.index("user") if "user" in kinds else True
    assert any(p["id"] == system["id"] for p in body["items"])


async def test_public_feed_is_public(client):
    """El feed de playlists públicas NO exige sesión (contenido comunitario)."""
    resp = await client.get("/playlists/public")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"items", "total", "offset", "limit"}


async def test_system_playlist_owned_by_system_user(client, session):
    """El admin que crea no es dueño: owner_id = usuario fijo del sistema."""
    await register_and_login(client, admin=True, session=session)
    system = await _create_system_playlist(
        client, f"Ownership {uuid.uuid4().hex[:6]}"
    )

    from app.features.playlists.models import Playlist

    playlist = await session.get(Playlist, uuid.UUID(system["id"]))
    assert playlist is not None
    assert playlist.owner_id == SYSTEM_USER_ID
