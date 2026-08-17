from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarativa única de la app. Los modelos importan `Base` desde acá."""
