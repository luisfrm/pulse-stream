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
from fastapi_users import BaseUserManager, exceptions
from fastapi_users.authentication import Strategy
from fastapi_users.router.common import ErrorCode

from app.core.config import settings
from app.core.security import apply_rate_limits
from app.features.auth.backend import auth_backend, cookie_transport
from app.features.auth.manager import current_user, fastapi_users
from app.features.users.panel_models import PanelUser
from app.features.users.schemas import UserRead, UserUpdate

router = APIRouter()

_USER_ALREADY_EXISTS = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail=ErrorCode.REGISTER_USER_ALREADY_EXISTS,
)


# --- Auth del panel (login custom + logout) ---
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
    user_token: tuple[PanelUser, str] = Depends(
        fastapi_users.authenticator.current_user_token(active=True)
    ),
    strategy: Strategy = Depends(auth_backend.get_strategy),
) -> Response:
    user, token = user_token
    return await auth_backend.logout(strategy, user, token)


apply_rate_limits(router, {"/auth/login": settings.rate_limit_login})


# --- Perfil de la propia cuenta del panel (sin self-service de /users/{id}) ---
@router.get("/users/me", response_model=UserRead, tags=["users"])
async def get_me(user: PanelUser = Depends(current_user)) -> PanelUser:
    """Cuenta autenticada del panel."""
    return user


@router.patch("/users/me", response_model=UserRead, tags=["users"])
async def update_me(
    payload: UserUpdate,
    user: PanelUser = Depends(current_user),
    user_manager: BaseUserManager = Depends(fastapi_users.get_user_manager),
) -> PanelUser:
    """Actualiza username/cover (y email/password propios) de la cuenta.

    `safe=True` descarta campos privilegiados (`is_superuser`, `is_active`,
    `is_verified`); el rol ni siquiera existe en `UserUpdate`.
    """
    try:
        return await user_manager.update(payload, user, safe=True)
    except exceptions.UserAlreadyExists:
        raise _USER_ALREADY_EXISTS from None
    except exceptions.InvalidPasswordException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": ErrorCode.UPDATE_USER_INVALID_PASSWORD,
                "reason": exc.reason,
            },
        ) from None


# El endpoint de init se registra aparte (`init_router.py`): no requiere auth y
# solo funciona cuando `panel_users` está vacío.
