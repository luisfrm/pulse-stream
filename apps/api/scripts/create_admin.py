"""Crea o rota el admin local del panel (Fase 0 de la migración a Hono).

Uso (desde `apps/api`):

    uv run python scripts/create_admin.py --email admin@example.com \\
        --password 'una-password-de-8+' --username panel

Idempotente por email: si la cuenta ya existe, actualiza password y reafirma
el rol admin (no duplica usuarios). No hay credenciales hardcodeadas: todo
entra por argumentos.
"""

import argparse
import asyncio
import sys

sys.path.insert(0, ".")

from app.db.session import async_session_factory, engine

# El script corre fuera de FastAPI (que importa todos los routers): hay que
# registrar los modelos para que SQLAlchemy resuelva las relaciones del mapper
# de `User` (Playlist, Listen, Favorites, etc.) antes de consultar.
import app.features.albums.models  # noqa: E402, F401
import app.features.artists.models  # noqa: E402, F401
import app.features.favorites.models  # noqa: E402, F401
import app.features.listens.models  # noqa: E402, F401
import app.features.playlists.models  # noqa: E402, F401
import app.features.songs.models  # noqa: E402, F401

from app.features.users.admin_seed import upsert_admin


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Email del admin")
    parser.add_argument(
        "--password",
        required=True,
        help="Password (mínimo 8 caracteres); se guarda hasheada",
    )
    parser.add_argument(
        "--username", default=None, help="Username visible (opcional)"
    )
    return parser.parse_args()


async def _run(args: argparse.Namespace) -> int:
    try:
        async with async_session_factory() as session:
            user = await upsert_admin(
                session, args.email, args.password, args.username
            )
            print(f"admin listo: {user.email} (id={user.id}, role={user.role})")
    finally:
        await engine.dispose()
    return 0


def main() -> int:
    args = _parse_args()
    try:
        return asyncio.run(_run(args))
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
