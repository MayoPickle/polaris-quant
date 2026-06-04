"""FastAPI application entrypoint (web process).

Run with:
    uvicorn app.main:app --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.strategies import registry

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    registry.load_builtin_strategies()
    logger.info("%s starting (env=%s, broker=%s)", settings.APP_NAME, settings.ENV, settings.ALPACA_ENV)
    yield
    logger.info("%s shutting down", settings.APP_NAME)


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    # API-only backend: send the root to the interactive docs.
    return RedirectResponse(url="/docs")
