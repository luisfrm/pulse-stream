"""biblioteca: favoritos de playlists y álbumes + query de snapshot (Fase 5)

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-19

- user_favorite_playlists: like de playlists (de usuario y del sistema).
  El like NO muta la playlist (las system solo las muta un admin): esta tabla
  es solo el marcador del usuario.
- user_favorite_albums: like de álbumes (mismo patrón que user_favorites).
- playlists.query: query de snapshot de las playlists system
  (top_week/top_month/new) para poder REGENERARLAS con
  POST /playlists/system/{id}/refresh. Las playlists creadas antes de esta
  migración quedan con query NULL (no refrescables hasta recrearlas).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Query de snapshot de las playlists del sistema (VARCHAR plano, regla de
    # enums: los valores se validan solo en Pydantic).
    op.add_column(
        "playlists", sa.Column("query", sa.String(length=20), nullable=True)
    )

    # Like de playlists (PK compuesta user+playlist, como user_favorites)
    op.create_table(
        "user_favorite_playlists",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("playlist_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["playlist_id"], ["playlists.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "playlist_id"),
    )

    # Like de álbumes (PK compuesta user+album)
    op.create_table(
        "user_favorite_albums",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("album_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "album_id"),
    )


def downgrade() -> None:
    op.drop_table("user_favorite_albums")
    op.drop_table("user_favorite_playlists")
    op.drop_column("playlists", "query")