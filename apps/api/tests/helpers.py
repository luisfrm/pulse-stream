import uuid

PASSWORD = "Str0ng-Pass!-42"


def email() -> str:
    return f"user-{uuid.uuid4().hex[:10]}@example.com"


async def register(
    client, email_address: str | None = None, password: str = PASSWORD
) -> dict:
    email_address = email_address or email()
    resp = await client.post(
        "/auth/register", json={"email": email_address, "password": password}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def login(client, email_address: str, password: str = PASSWORD) -> None:
    resp = await client.post(
        "/auth/login", data={"username": email_address, "password": password}
    )
    assert resp.status_code == 204, resp.text


async def register_and_login(
    client, *, admin: bool = False, session=None
) -> dict:
    """Registra y loguea un usuario; si `admin=True`, lo promueve en la DB."""
    user = await register(client)
    await login(client, user["email"])
    if admin:
        assert session is not None, "admin=True requiere el fixture `session`"
        from sqlalchemy import select

        from app.features.users.models import User

        db_user = (
            await session.execute(select(User).where(User.email == user["email"]))
        ).scalar_one()
        db_user.is_superuser = True
        db_user.role = "admin"
        await session.commit()
    return user
