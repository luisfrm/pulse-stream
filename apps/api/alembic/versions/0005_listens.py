"""historial de reproducciones (listens) + ranking popular (Fase 3b)

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-17

- listens: una fila por play (user_id + song_id + played_at).
  Alimenta "recientes" del usuario y el top "populares" del catálogo.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "listens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("song_id", sa.Uuid(), nullable=False),
        sa.Column(
            "played_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Índices para las dos queries típicas: recientes por usuario y top global.
    op.create_index("ix_listens_user_id", "listens", ["user_id"])
    op.create_index("ix_listens_song_id", "listens", ["song_id"])
    op.create_index("ix_listens_played_at", "listens", ["played_at"])


def downgrade() -> None:
    op.drop_table("listens")