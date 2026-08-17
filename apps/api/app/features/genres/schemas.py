from enum import Enum


class SongGenre(str, Enum):
    """Géneros permitidos.

    Regla AGENTS.md: enums viven SOLO en Pydantic — en la DB los géneros se
    guardan como strings (columna JSON de songs). Si agregás un género acá,
    regenerás los tipos TS (`pnpm gen:types`) y TypeScript te avisa en el front.
    """

    POP = "pop"
    ROCK = "rock"
    HIPHOP = "hip-hop"
    ELECTRONIC = "electronic"
    JAZZ = "jazz"
    CLASSICAL = "classical"
    REGGAETON = "reggaeton"
    FOLK = "folk"
    METAL = "metal"
    RNB = "r&b"
    LATIN = "latin"
    INDIE = "indie"
