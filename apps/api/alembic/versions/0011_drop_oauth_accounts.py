"""Elimina `oauth_accounts` (se removió el login con Google).

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-21

La app ya no usa OAuth: las cuentas se crean con el seed del panel y el login
es email/usuario + contraseña. `0010` queda como migración histórica; esta
migración limpia la tabla que solo existía para Google.

`users.hashed_password` se mantiene nullable por compatibilidad con datos
legacy; el alta nueva siempre setea un hash.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_table("oauth_accounts")


def downgrade() -> None:
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
