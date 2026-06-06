from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.brokers.base import Bar
from app.db.base import Base
from app.models.backtest import BacktestJob
from app.models.user import User
from app.strategies.backtest import BacktestResult
from app.workers.jobs import run_batch_backtest as batch_job_module


def worker_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)


def seed_batch_job(Session, job_id: str, symbols: list[str]) -> None:
    with Session() as db:
        db.add(User(id=1, email="test@example.com", hashed_password="x"))
        db.add(
            BacktestJob(
                id=job_id,
                user_id=1,
                strategy_key="sma_cross",
                params={},
                timeframe="1Day",
                lookback_days=365,
                initial_capital=100_000,
                universes=[],
                symbols=symbols,
                total_symbols=len(symbols),
                status="queued",
                report={},
            )
        )
        db.commit()


def fake_bars() -> list[Bar]:
    return [
        Bar(
            timestamp=f"2026-01-{day:02d}T00:00:00+00:00",
            open=100 + day,
            high=101 + day,
            low=99 + day,
            close=100 + day,
            volume=1000,
        )
        for day in range(1, 8)
    ]


def fake_backtest_result(symbol: str) -> BacktestResult:
    return BacktestResult(
        symbol=symbol,
        strategy_key="sma_cross",
        initial_capital=100_000,
        position_size_pct=20,
        position_sizing={},
        final_equity=101_000,
        total_return_pct=1,
        buy_hold_return_pct=0.5,
        alpha_return_pct=0.5,
        num_trades=1,
        win_rate_pct=100,
        max_drawdown_pct=0,
        sharpe=1,
        equity_curve=[],
        trades=[],
    )


def patch_successful_backtest(monkeypatch) -> None:
    monkeypatch.setattr(batch_job_module.registry, "load_builtin_strategies", lambda: None)
    monkeypatch.setattr(batch_job_module.registry, "create_strategy", lambda *args: object())
    monkeypatch.setattr(
        batch_job_module,
        "run_backtest",
        lambda strategy, symbol, bars, **kwargs: fake_backtest_result(symbol),
    )

