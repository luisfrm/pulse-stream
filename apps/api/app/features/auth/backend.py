import uuid

from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)

from app.core.config import settings
from app.features.users.models import User

# Cookie HttpOnly: el token JWT nunca es accesible desde JS ni viaja en el body.
# `cookie_domain` (opcional) comparte la cookie entre subdominios del mismo
# dominio registrable — sin él, la cookie es host-only de la API y el guard del
# frontend (que chequea la cookie en su propio dominio) nunca la ve.
cookie_transport = CookieTransport(
    cookie_name="session",
    cookie_max_age=60 * 60 * 24 * 7,  # 7 días
    cookie_secure=settings.cookie_secure,
    cookie_httponly=True,
    cookie_samesite=settings.cookie_samesite,
    cookie_domain=settings.cookie_domain,
)


def get_jwt_strategy() -> JWTStrategy[User, uuid.UUID]:
    return JWTStrategy(
        secret=settings.auth_secret,
        lifetime_seconds=60 * 60 * 24 * 7,
    )


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)
