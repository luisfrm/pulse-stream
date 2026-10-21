"""Alta / rotación del admin local del panel (Fase 0 de la migración a Hono).

El panel nuevo (Worker Hono) no comparte usuarios con la API FastAPI todavía:
el admin del panel se crea con este helper (y el CLI `scripts/create_admin.py`).
Es idempotente por email (case-insensitive): si el usuario ya existe, rota el
password y reafirma el rol — nunca duplica la cuenta.
"""

from pydantic import EmailStr, TypeAdapter
from pwdlib import PasswordHash
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.users.models import User

MIN_PASSWORD_LENGTH = 8

# Mismo hasher que usa fastapi-users (`pwdlib.PasswordHash.recommended()`) para
# que el hash generado acá sea verificable por `UserManager.authenticate`.
_password_hash = PasswordHash.recommended()
# `UserRead` valida el email con EmailStr: el seed debe rechazar dominios
# inválidos/reservados (ej. `.local`) en vez de crear un admin que después
# explota en `GET /users/me`.
_email_adapter = TypeAdapter(EmailStr)


async def upsert_admin(
    session: AsyncSession,
    email: str,
    password: str,
    username: str | None = None,
) -> User:
    """Crea el admin del panel o actualiza su password/rol si ya existe.

    - Email normalizado a lowercase (el login de fastapi-users compara
      case-insensitive, pero la columna guarda el valor canónico).
    - Password mínima de 8 caracteres (ValueError si no).
    - Siempre deja `role="admin"`, `is_active` y `is_verified` en True.
    - `username` solo se toca si viene (una rotación de password no lo borra).
    """
    normalized_email = str(
        _email_adapter.validate_python(email.strip().lower())
    )
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"La password debe tener al menos {MIN_PASSWORD_LENGTH} caracteres"
        )

    hashed_password = _password_hash.hash(password)

    user = (
        await session.execute(
            select(User).where(func.lower(User.email) == normalized_email)
        )
    ).scalar_one_or_none()

    if user is None:
        user = User(
            email=normalized_email,
            hashed_password=hashed_password,
            role="admin",
            is_active=True,
            is_verified=True,
        )
        if username:
            user.username = username.strip()
        session.add(user)
    else:
        user.hashed_password = hashed_password
        user.role = "admin"
        user.is_active = True
        user.is_verified = True
        if username:
            user.username = username.strip()

    await session.commit()
    await session.refresh(user)
    return user
