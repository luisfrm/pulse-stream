from fastapi import APIRouter, Depends, Request

from app.core.config import settings
from app.core.security import limiter
from app.features.auth.manager import current_user
from app.features.uploads.schemas import PresignRequest, PresignResponse
from app.features.uploads.service import UploadService, get_upload_service

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/presign", response_model=PresignResponse)
@limiter.limit(settings.rate_limit_presign)
async def presign_upload(
    request: Request,
    payload: PresignRequest,
    service: UploadService = Depends(get_upload_service),
    _=Depends(current_user),
) -> PresignResponse:
    """Firma una URL de subida directa a R2 (5-10 min de validez)."""
    return await service.presign_upload(payload)
