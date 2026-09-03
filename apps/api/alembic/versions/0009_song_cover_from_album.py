"""covers: la canción hereda el cover del álbum (Fase 7)

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-03

- songs.cover_key DROP: las canciones ya no tienen cover propio —
  `Song.cover_url` resuelve `album.cover_key` vía la relación (una sola
  imagen por álbum, compartida por todas sus canciones → 1 descarga).
- Las canciones legacy sin álbum quedan sin cover (placeholder del front)
  hasta que se les asigne un álbum. `songs.album_id` sigue nullable por
  esas filas históricas; la API exige álbum en altas y rechaza quitarlo.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("songs", "cover_key")


def downgrade() -> None:
    # Downgrade CON PÉRDIDA: re-crea la columna pero no restaura los valores
    # (no hay migración de datos porque no había prod con covers propios
    # divergentes del álbum al momento de la Fase 7).
    op.add_column(
        "songs", sa.Column("cover_key", sa.String(length=1024), nullable=True)
    )
