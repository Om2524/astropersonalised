from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

Base = declarative_base()


@lru_cache
def get_engine():
    from app.config import settings

    return create_async_engine(
        settings.DATABASE_URL,
        echo=(settings.ENV == "development"),
        pool_size=5,
        max_overflow=10,
        connect_args={"ssl": "prefer"} if "supabase" in settings.DATABASE_URL else {},
    )


@lru_cache
def get_session_maker():
    return async_sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_maker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
