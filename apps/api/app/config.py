from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/shastra"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    GEMINI_API_KEY: str = ""
    GEOCODING_API_KEY: str = ""
    ENV: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
