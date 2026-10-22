"""Guard del bootstrap `/init`.

`POST /init` crea la primera cuenta administradora sin sesión, así que no debe
quedar expuesto en un deploy real. Reglas:

- Si `INIT_TOKEN` está configurado, se exige el header `X-Init-Token` en
  CUALQUIER entorno (comparación en tiempo constante).
- Sin token: solo se permite `ENV=local` y una conexión directa desde loopback
  (`127.0.0.1` / `::1`). No se confía en `X-Forwarded-For`: si hay un proxy
  delante, configurá `INIT_TOKEN`.
"""

import hmac

from fastapi import HTTPException, Request, status

from app.core.config import Environment, settings

_LOOPBACK_HOSTS = frozenset(
    {"127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"}
)


def require_init_allowed(request: Request) -> None:
    token = (settings.init_token or "").strip()
    if token:
        provided = request.headers.get("X-Init-Token")
        if provided is None or not hmac.compare_digest(provided, token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Init no autorizado",
            )
        return

    if settings.env is not Environment.LOCAL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Init deshabilitado fuera de local sin INIT_TOKEN",
        )

    client = request.client
    host = client.host if client is not None else None
    if host not in _LOOPBACK_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Init solo permitido desde loopback en local",
        )
