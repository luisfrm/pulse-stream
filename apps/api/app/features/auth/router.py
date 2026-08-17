from fastapi import APIRouter

from app.core.config import settings
from app.core.security import apply_rate_limits
from app.features.auth.backend import auth_backend
from app.features.auth.manager import fastapi_users
from app.features.users.schemas import UserCreate, UserRead, UserUpdate

router = APIRouter()

# --- Auth (fastapi-users) ---
auth_router = fastapi_users.get_auth_router(auth_backend)
apply_rate_limits(auth_router, {"/login": settings.rate_limit_login})
router.include_router(auth_router, prefix="/auth", tags=["auth"])

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
