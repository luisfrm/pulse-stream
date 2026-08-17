"""playlists, favorites y covers (Fase 3 — módulos estilo Spotify)

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-17

- playlists (dueño = users)
- playlist_songs (asociativa con posición; PK compuesta playlist+song)
- user_favorites (like de canción; PK compuesta user+song)
- songs.cover_key / artists.cover_key (covers subidos a R2, JPG <= 512 KB)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Covers (cuadrículas) en canciones y artistas
    op.add_column("songs", sa.Column("cover_key", sa.String(length=1024), nullable=True))
    op.add_column("artists", sa.Column("cover_key", sa.String(length=1024), nullable=True))

    # Playlists
    op.create_table(
        "playlists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_key", sa.String(length=1024), nullable=True),
        sa.Column("is_public", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_playlists_owner_id", "playlists", ["owner_id"])

    op.create_table(
        "playlist_songs",
        sa.Column("playlist_id", sa.Uuid(), nullable=False),
        sa.Column("song_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("playlist_id", "song_id"),
    )

    # Favoritos (like)
    op.create_table(
        "user_favorites",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("song_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "song_id"),
    )


def downgrade() -> None:
    op.drop_table("user_favorites")
    op.drop_table("playlist_songs")
    op.drop_table("playlists")
    op.drop_column("artists", "cover_key")
    op.drop_column("songs", "cover_key")
