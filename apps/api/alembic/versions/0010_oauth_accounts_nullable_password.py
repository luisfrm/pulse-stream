"""OAuth: password nullable + tabla oauth_accounts (Fase 0 migración Hono)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-21

- `users.hashed_password` pasa a NULL: un usuario creado por Google OAuth no
  tiene password local. `UserManager.authenticate` lo rechaza con 400 (nunca
  500) manteniendo el hash dummy para el timing.
- `oauth_accounts`: vínculo entre un usuario y su cuenta en un proveedor
  OAuth (hoy solo "google"). No guarda tokens del proveedor: el panel (Hono)
  valida el ID token y emite su propia cookie.
  - UNIQUE(provider, provider_account_id): la misma cuenta externa no puede
    apuntar a dos usuarios.
  - UNIQUE(user_id, provider): a lo sumo una cuenta por proveedor y usuario.
  - FK user_id -> users.id ON DELETE CASCADE (indexada).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(length=1024),
        nullable=True,
    )

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column(
            "provider_account_id", sa.String(length=255), nullable=False
        ),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "provider_account_id",
            name="uq_oauth_accounts_provider_account",
        ),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            name="uq_oauth_accounts_user_provider",
        ),
    )
    op.create_index(
        "ix_oauth_accounts_user_id", "oauth_accounts", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_table("oauth_accounts")

    # OJO: vuelve a NOT NULL y FALLA si quedaron usuarios creados por OAuth
    # (hashed_password IS NULL). Antes de bajar esta migración hay que borrar
    # esos usuarios o asignarles un password:
    #   UPDATE users SET hashed_password = '<hash>' WHERE hashed_password IS NULL;
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(length=1024),
        nullable=False,
    )
