"""create artists and songs tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("image_url", sa.String(length=1024), nullable=True),
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
    op.create_index("ix_artists_name", "artists", ["name"], unique=True)

    op.create_table(
        "songs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist_id", sa.Uuid(), nullable=False),
        sa.Column("genres", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("lyrics", sa.Text(), nullable=True),
        sa.Column("object_key", sa.String(length=1024), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key"),
    )
    op.create_index("ix_songs_artist_id", "songs", ["artist_id"])
    op.create_index("ix_songs_title", "songs", ["title"])


def downgrade() -> None:
    op.drop_index("ix_songs_title", table_name="songs")
    op.drop_index("ix_songs_artist_id", table_name="songs")
    op.drop_table("songs")
    op.drop_index("ix_artists_name", table_name="artists")
    op.drop_table("artists")
