"""Helpers de integración.

Desde la migración 0012 el panel autentica contra `panel_users`; los tests
crean esas cuentas directamente en la DB (no hay registro público) y luego
hacen login por API. Los datos de la app (usuarios públicos, playlists,
listens) se siembran con los helpers de abajo.
"""

import uuid
from datetime import datetime, timezone

from pwdlib import PasswordHash

from app.features.listens.models import Listen
from app.features.playlists.models import Playlist
from app.features.users.models import SYSTEM_USER_ID, User
from app.features.users.panel_models import PanelUser

PASSWORD = "Str0ng-Pass!-42"

_password_hash = PasswordHash.recommended()


def email() -> str:
    return f"user-{uuid.uuid4().hex[:10]}@example.com"


async def create_panel_user(
    session,
    email_address: str | None = None,
    password: str = PASSWORD,
    *,
    role: str | None = None,
    username: str | None = None,
) -> PanelUser:
    """Inserta una cuenta de panel (hash argon2id verificable por el login)."""
    user = PanelUser(
        email=(email_address or email()).lower(),
        hashed_password=_password_hash.hash(password),
        role=role,
        username=username,
        is_active=True,
        is_verified=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def login(client, email_address: str, password: str = PASSWORD) -> None:
    resp = await client.post(
        "/auth/login", data={"username": email_address, "password": password}
    )
    assert resp.status_code == 204, resp.text


async def register_and_login(
    client, *, admin: bool = False, session=None
) -> dict:
    """Crea una cuenta de panel, la loguea y devuelve su shape público.

    Se mantiene el nombre histórico del helper (`register_and_login`) para no
    tocar todos los tests, pero ya no existe `/auth/register`.
    """
    assert session is not None, "register_and_login requiere el fixture `session`"
    user = await create_panel_user(
        session, role="admin" if admin else None
    )
    await login(client, user.email)
    return {
        "id": str(user.id),
        "email": user.email,
        "role": user.role,
        "username": user.username,
    }


async def create_app_user(
    session,
    email_address: str | None = None,
    *,
    username: str | None = None,
) -> User:
    """Crea un usuario público (`users`) para dueño de playlists/listens."""
    user = User(
        email=(email_address or email()).lower(),
        username=username,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        role=None,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def create_user_playlist(
    session,
    *,
    owner_id: uuid.UUID | None = None,
    name: str = "Playlist",
    is_public: bool = False,
    kind: str = "user",
    query: str | None = None,
) -> Playlist:
    playlist = Playlist(
        owner_id=owner_id or SYSTEM_USER_ID,
        name=name,
        is_public=is_public,
        kind=kind,
        query=query,
    )
    session.add(playlist)
    await session.commit()
    await session.refresh(playlist)
    return playlist


async def add_listen(
    session,
    song_id: uuid.UUID | str,
    *,
    user_id: uuid.UUID | str = SYSTEM_USER_ID,
    played_at: datetime | None = None,
) -> Listen:
    """Siembra un play directo en `listens` (los tests ya no usan /me/listens)."""
    listen = Listen(
        user_id=user_id,
        song_id=song_id,
        played_at=played_at or datetime.now(timezone.utc),
    )
    session.add(listen)
    await session.commit()
    await session.refresh(listen)
    return listen
