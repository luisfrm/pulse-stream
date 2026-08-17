"""Seguridad: rate limiting (slowapi) y notas de CSRF.

Rate limiting:
  Protege /auth/login, /auth/register y (en Fase 1) /uploads/presign.
  Storage en memoria; para múltiples workers usar Redis como storage_uri.

CSRF:
  Con SameSite=lax (local) el navegador ya bloquea requests cross-site de
  mutación. Antes de producción (SameSite=none) hay que habilitar protección
  CSRF (double-submit cookie con header X-CSRF-Token) en todo endpoint mutante
  — ver checklist de seguridad del plan (sección 13).
"""

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")


async def rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiados intentos. Intentá de nuevo más tarde."},
    )


def apply_rate_limits(router: APIRouter, limits: dict[str, str]) -> None:
    """Aplica límites de slowapi a rutas ya construidas (ej. las de fastapi-users).

    Los endpoints de fastapi-users reciben `request: Request`, que es lo que
    slowapi necesita para leer la IP.
    """
    for route in router.routes:
        limit = limits.get(route.path)
        if limit is not None:
            route.endpoint = limiter.limit(limit)(route.endpoint)
