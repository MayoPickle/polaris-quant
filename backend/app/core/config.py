"""Application configuration loaded from environment variables.

Values are read from `backend/.env` (see `.env.example`). The same settings
object is used by the web process and the worker process.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory, resolved from this file so the .env is found regardless of
# the process working directory (e.g. uvicorn launched from the repo root).
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Application ----
    APP_NAME: str = "Polaris Quant"
    ENV: Literal["development", "production"] = "development"
    DEBUG: bool = True
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    FRONTEND_ORIGIN: str = "http://localhost:3000"

    # ---- Security ----
    SECRET_KEY: str = "changeme"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ENCRYPTION_KEY: str = "changeme"

    # ---- Database ----
    DATABASE_URL: str = "sqlite:///./polaris.db"

    # ---- Broker: Alpaca ----
    ALPACA_ENV: Literal["paper", "live"] = "paper"
    ALPACA_API_KEY: str = ""
    ALPACA_API_SECRET: str = ""
    ALPACA_PAPER_BASE_URL: str = "https://paper-api.alpaca.markets"
    ALPACA_LIVE_BASE_URL: str = "https://api.alpaca.markets"
    ALPACA_DATA_URL: str = "https://data.alpaca.markets"
    ALPACA_DATA_FEED: Literal["iex", "sip"] = "iex"

    # ---- Scheduler / market hours ----
    SCHEDULER_TIMEZONE: str = "America/New_York"
    MARKET_TIMEZONE: str = "America/New_York"

    # ---- Automated strategy trading ----
    DEFAULT_STRATEGY_SCHEDULE: str = "55 10-15 * * 1-5"
    STRATEGY_TIMEFRAME: Literal["1Hour"] = "1Hour"
    STRATEGY_LOOKBACK_DAYS: int = 30
    STRATEGY_DATA_DELAY_MINUTES: int = 20

    # ---- OpenAI position sizing ----
    OPENAI_API_KEY: str = ""
    POSITION_MODEL: str = "gpt-5.5"
    DEFAULT_POSITION_ALLOCATION_PCT: float = 1.0
    OPENAI_TIMEOUT_SECONDS: float = 15.0

    # ---- Batch backtesting ----
    REDIS_URL: str = "redis://localhost:6379/0"
    BACKTEST_QUEUE_NAME: str = "backtests"
    BACKTEST_WORKER_MODE: Literal["simple", "fork"] = "simple"
    BACKTEST_JOB_TIMEOUT_SECONDS: int = 60 * 60 * 2
    BACKTEST_MAX_SYMBOLS: int = 750
    BACKTEST_SYMBOL_THROTTLE_SECONDS: float = 0.05

    # ---- Risk controls ----
    TRADING_ENABLED: bool = False
    MAX_POSITION_SIZE_USD: float = 1000.0
    MAX_ORDER_SIZE_USD: float = 500.0
    MAX_DAILY_LOSS_USD: float = 200.0

    # ---- Logging ----
    LOG_LEVEL: str = "INFO"

    @property
    def resolved_database_url(self) -> str:
        """Anchor a relative SQLite path to the backend dir so it doesn't depend
        on the process working directory."""
        prefix = "sqlite:///./"
        if self.DATABASE_URL.startswith(prefix):
            rel = self.DATABASE_URL[len(prefix):]
            return f"sqlite:///{BACKEND_DIR / rel}"
        return self.DATABASE_URL

    @property
    def is_paper(self) -> bool:
        return self.ALPACA_ENV == "paper"

    @property
    def alpaca_base_url(self) -> str:
        return self.ALPACA_PAPER_BASE_URL if self.is_paper else self.ALPACA_LIVE_BASE_URL


@lru_cache
def get_settings() -> Settings:
    """Cached singleton so the .env file is parsed only once."""
    return Settings()


settings = get_settings()
