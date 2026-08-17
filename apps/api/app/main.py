from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.logging import configure_logging
from app.core.security import limiter, rate_limit_exceeded_handler
from app.features.artists.router import router as artists_router
from app.features.auth.router import router as auth_router
from app.features.favorites.router import router as favorites_router
from app.features.genres.router import router as genres_router
from app.features.playlists.router import router as playlists_router
from app.features.songs.router import router as songs_router
from app.features.uploads.router import router as uploads_router
from app.features.users.router import router as users_admin_router
from app.shared.exceptions import AppError

configure_logging()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Pulse Stream API",
        version="0.1.0",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
    )

    # CORS con allow-list por regex + credenciales (cookies).
    # Nunca allow_origin="*" con cookies: el navegador lo bloquea.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting (slowapi)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    # Excepciones de dominio -> HTTP (los services no conocen HTTP)
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}
        )

    app.include_router(auth_router)
    app.include_router(users_admin_router)
    app.include_router(artists_router)
    app.include_router(songs_router)
    app.include_router(genres_router)
    app.include_router(uploads_router)
    app.include_router(playlists_router)
    app.include_router(favorites_router)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
