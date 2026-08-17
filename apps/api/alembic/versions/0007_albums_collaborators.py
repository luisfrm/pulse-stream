"""álbumes y colaboradores de canciones (Fase 4)

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-17

- albums: tabla nueva (title + artist_id; un álbum pertenece a un artista).
- song_collaborators: asociación canción <-> artista invitado (PK compuesta).
- songs: +album_id (FK a albums, SET NULL al borrar el álbum).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "albums",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist_id", sa.Uuid(), nullable=False),
        sa.Column("cover_key", sa.String(length=1024), nullable=True),
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
    )
    op.create_index("ix_albums_artist_id", "albums", ["artist_id"])

    op.create_table(
        "song_collaborators",
        sa.Column("song_id", sa.Uuid(), nullable=False),
        sa.Column("artist_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("song_id", "artist_id"),
    )
    op.create_index(
        "ix_song_collaborators_artist_id", "song_collaborators", ["artist_id"]
    )

    op.add_column("songs", sa.Column("album_id", sa.Uuid(), nullable=True))
    op.create_index("ix_songs_album_id", "songs", ["album_id"])
    op.create_foreign_key(
        "fk_songs_album_id_albums",
        "songs",
        "albums",
        ["album_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_songs_album_id_albums", "songs", type_="foreignkey")
    op.drop_index("ix_songs_album_id", table_name="songs")
    op.drop_column("songs", "album_id")
    op.drop_index("ix_song_collaborators_artist_id", table_name="song_collaborators")
    op.drop_table("song_collaborators")
    op.drop_index("ix_albums_artist_id", table_name="albums")
    op.drop_table("albums")
