from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"
    app_env: str = "development"

    max_reviews_to_fetch: int = 25

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
