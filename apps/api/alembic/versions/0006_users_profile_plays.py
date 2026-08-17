"""usuarios con username/cover/contador, play_count en canciones, playlists system (Fase 4)

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-17

- users: +username (único, nullable para usuarios previos), +cover_key
  (foto de perfil en R2), +total_plays (contador de reproducciones del usuario).
- songs: +play_count (contador persistente; el ranking por ventana sigue
  usando `listens`).
- playlists: +kind ('user' | 'system' — regla de enums: VARCHAR plano,
  validado solo en Pydantic).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=50), nullable=True))
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.add_column("users", sa.Column("cover_key", sa.String(length=1024), nullable=True))
    op.add_column(
        "users",
        sa.Column("total_plays", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "songs",
        sa.Column("play_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.create_index("ix_songs_play_count", "songs", ["play_count"])
    op.add_column(
        "playlists",
        sa.Column("kind", sa.String(length=20), server_default=sa.text("'user'"), nullable=False),
    )
    op.create_index("ix_playlists_kind", "playlists", ["kind"])


def downgrade() -> None:
    op.drop_index("ix_playlists_kind", table_name="playlists")
    op.drop_column("playlists", "kind")
    op.drop_index("ix_songs_play_count", table_name="songs")
    op.drop_column("songs", "play_count")
    op.drop_column("users", "total_plays")
    op.drop_column("users", "cover_key")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "username")
