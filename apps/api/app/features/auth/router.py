from fastapi import (
    APIRouter,
    Depends,
    Form,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager
from fastapi_users.authentication import Strategy
from fastapi_users.router.common import ErrorCode

from app.core.config import settings
from app.core.security import apply_rate_limits
from app.features.auth.backend import auth_backend, cookie_transport
from app.features.auth.manager import fastapi_users
from app.features.users.models import User
from app.features.users.schemas import UserCreate, UserRead, UserUpdate

router = APIRouter()

# --- Auth (login custom + logout, el resto de fastapi-users) ---
# Login escrito a mano en vez de get_auth_router para soportar "remember me":
#   remember=True  -> cookie persistente (7 días, igual que la vida del JWT)
#   remember=False -> cookie de sesión (expira al cerrar el navegador)
# Mantiene la firma de /auth/login (form-urlencoded username+password, 204).
@router.post("/auth/login", name="auth:cookie.login", status_code=status.HTTP_204_NO_CONTENT)
async def login(
    request: Request,
    credentials: OAuth2PasswordRequestForm = Depends(),
    remember: bool = Form(False),
    user_manager: BaseUserManager = Depends(fastapi_users.get_user_manager),
    strategy: Strategy = Depends(auth_backend.get_strategy),
) -> Response:
    user = await user_manager.authenticate(credentials)

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorCode.LOGIN_BAD_CREDENTIALS,
        )

    token = await strategy.write_token(user)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.set_cookie(
        cookie_transport.cookie_name,
        token,
        # Sin max_age = cookie de sesión (muere al cerrar el navegador);
        # con max_age = persistente hasta que expire el JWT (7 días).
        max_age=cookie_transport.cookie_max_age if remember else None,
        path=cookie_transport.cookie_path,
        domain=cookie_transport.cookie_domain,
        secure=cookie_transport.cookie_secure,
        httponly=cookie_transport.cookie_httponly,
        samesite=cookie_transport.cookie_samesite,
    )
    await user_manager.on_after_login(user, request, response)
    return response


@router.post("/auth/logout", name="auth:cookie.logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    user_token: tuple[User, str] = Depends(
        fastapi_users.authenticator.current_user_token(active=True)
    ),
    strategy: Strategy = Depends(auth_backend.get_strategy),
) -> Response:
    user, token = user_token
    return await auth_backend.logout(strategy, user, token)


apply_rate_limits(router, {"/auth/login": settings.rate_limit_login})

register_router = fastapi_users.get_register_router(UserRead, UserCreate)
apply_rate_limits(register_router, {"/register": settings.rate_limit_register})
router.include_router(register_router, prefix="/auth", tags=["auth"])

# Reset de password y verificación de email (los hooks on_after_* se implementan
# en Fase 1/3; los endpoints quedan listos).
router.include_router(
    fastapi_users.get_reset_password_router(), prefix="/auth", tags=["auth"]
)
router.include_router(
    fastapi_users.get_verify_router(UserRead), prefix="/auth", tags=["auth"]
)

# Self-service del usuario: GET/PATCH/DELETE /users/me (y /users/{id} admin).
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)