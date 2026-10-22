"""Guard del usuario fijo de sistema (dueño de las playlists `system`)."""

import pytest
from sqlalchemy import select

from app.features.users.models import (
    SYSTEM_USER_ID,
    SystemUserProtectedError,
    User,
)

pytestmark = pytest.mark.asyncio


async def test_system_user_cannot_be_deleted_via_orm(session):
    user = (
        await session.execute(select(User).where(User.id == SYSTEM_USER_ID))
    ).scalar_one()
    assert user.email == "system@pulse-stream.app"

    await session.delete(user)
    with pytest.raises(SystemUserProtectedError):
        await session.flush()
    await session.rollback()
