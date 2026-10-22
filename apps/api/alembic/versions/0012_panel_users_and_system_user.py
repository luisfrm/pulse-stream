"""Separa el auth del panel (`panel_users`) y agrega el usuario de sistema.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-22

Contexto (split panel/app):
- `users` queda como tabla de usuarios públicos de la app (target de las FKs de
  playlists/favoritos/listens). `users.hashed_password` se mantiene porque el
  auth custom de Hono todavía lo usa (se elimina en una fase posterior).
- `panel_users` es la única tabla contra la que autentica FastAPI/fastapi-users
  (panel/admin local). No tiene FKs a `users`.
- Se copian los admins existentes (`users.role='admin' OR is_superuser`) con el
  mismo UUID/email/hash/username/timestamps. `is_superuser` se fuerza a False:
  fastapi-users exige la columna, pero la autorización es solo `role='admin'`.
- Se inserta un usuario fijo (`system@pulse-stream.app`, sin password, inactivo)
  dueño de las playlists `kind='system'`; se reasignan las existentes.

Downgrade: NO toca las playlists system ni borra el usuario de sistema. El
usuario de sistema es una fila válida de `users`, así que `playlists.owner_id`
sigue apuntando a un usuario existente (sin violar el FK). Solo se dropea
`panel_users`: las cuentas panel-only creadas con `/init` desaparecen (no tienen
fila en `users`), mientras que los admins copiados en el upgrade siguen
existiendo en `users`. El usuario de sistema queda como residuo inofensivo
(inactivo, sin password) para que un re-upgrade sea idempotente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001"
SYSTEM_USER_EMAIL = "system@pulse-stream.app"


def upgrade() -> None:
    op.create_table(
        "panel_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "is_verified",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=20), nullable=True),
        sa.Column("username", sa.String(length=50), nullable=True),
        sa.Column("cover_key", sa.String(length=1024), nullable=True),
        sa.Column(
            "total_plays",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_panel_users_email", "panel_users", ["email"], unique=True)
    op.create_index(
        "ix_panel_users_username", "panel_users", ["username"], unique=True
    )

    # Copia de admins existentes. El WHERE es explícito para no arrastrar
    # usuarios normales de la app.
    op.execute(
        """
        INSERT INTO panel_users (
            id, email, hashed_password, is_active, is_superuser, is_verified,
            role, username, cover_key, total_plays, created_at, updated_at
        )
        SELECT
            id, email, hashed_password, is_active, false, is_verified,
            'admin', username, cover_key, total_plays, created_at, updated_at
        FROM users
        WHERE role = 'admin' OR is_superuser IS TRUE
        ON CONFLICT (id) DO NOTHING
        """
    )

    # Usuario fijo del sistema: dueño de las playlists kind='system'. Email
    # válido (EmailStr) y distinto de `.local`; sin password e inactivo para que
    # no pueda loguearse en la app.
    op.execute(
        f"""
        INSERT INTO users (
            id, email, hashed_password, is_active, is_superuser, is_verified,
            role, username, cover_key, total_plays, created_at, updated_at
        )
        VALUES (
            '{SYSTEM_USER_ID}', '{SYSTEM_USER_EMAIL}', NULL, false, false, true,
            NULL, NULL, NULL, 0, now(), now()
        )
        ON CONFLICT (id) DO NOTHING
        """
    )

    op.execute(
        f"UPDATE playlists SET owner_id = '{SYSTEM_USER_ID}' "
        "WHERE kind = 'system'"
    )


def downgrade() -> None:
    # Las playlists system quedan con su dueño actual: el usuario fijo del
    # sistema, que es una fila real de `users` (el FK sigue válido). No se
    # reasigna a `panel_users` porque esas cuentas pueden no existir en `users`
    # (p. ej. el primer admin creado por /init) y romperían el FK.
    #
    # Solo se elimina la tabla del panel. Limitación documentada: los admins
    # panel-only se pierden en el downgrade; los copiados desde `users` siguen
    # existiendo como usuarios legacy (con su role/is_superuser originales).
    op.drop_index("ix_panel_users_username", table_name="panel_users")
    op.drop_index("ix_panel_users_email", table_name="panel_users")
    op.drop_table("panel_users")
