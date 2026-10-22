from fastapi import APIRouter, Depends, Request, status

from app.core.config import settings
from app.core.security import limiter
from app.features.users.panel_models import PanelUser
from app.features.users.schemas import InitCreate, InitStatusRead, UserRead
from app.features.users.service import UserService

router = APIRouter(prefix="/init", tags=["init"])


@router.get("/status", response_model=InitStatusRead)
async def init_status(
    service: UserService = Depends(),
) -> InitStatusRead:
    """Indica si el panel necesita crear su primera cuenta administradora."""
    return InitStatusRead(needs_init=await service.needs_init())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_init)
async def init_panel(
    request: Request,
    payload: InitCreate,
    service: UserService = Depends(),
) -> PanelUser:
    """Crea el primer admin del panel. Sin auth, solo si `panel_users` vacío."""
    return await service.create_first_admin(payload)
