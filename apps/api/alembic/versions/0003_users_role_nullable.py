"""users.role nullable (null = usuario normal, 'admin' = panel)

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-17

Semántica de rol (Fase 2):
- role = NULL  -> usuario normal (sin permisos especiales)
- role = 'admin' -> acceso al panel de administración

La columna deja de tener default y NOT NULL; los valores legacy 'user' se
normalizan a NULL (regla AGENTS.md: los enums viven solo en Pydantic).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Quita NOT NULL y el server_default ('user') ANTES de tocar los datos
    op.alter_column(
        "users",
        "role",
        existing_type=sa.String(length=20),
        existing_server_default="user",
        server_default=None,
        nullable=True,
    )
    # 2) Normaliza los valores legacy: 'user' ya no existe como rol -> NULL
    op.execute("UPDATE users SET role = NULL WHERE role = 'user'")


def downgrade() -> None:
    # Reversa: vuelve a NOT NULL con default 'user'
    op.execute("UPDATE users SET role = 'user' WHERE role IS NULL")
    op.alter_column(
        "users",
        "role",
        existing_type=sa.String(length=20),
        existing_server_default=None,
        server_default="user",
        nullable=False,
    )
