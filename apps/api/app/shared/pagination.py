"""Helpers de paginación compartidos (offset/limit)."""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    offset: int
    limit: int


def paginate(items: list[T], total: int, offset: int, limit: int) -> Page[T]:
    return Page(items=items, total=total, offset=offset, limit=limit)
