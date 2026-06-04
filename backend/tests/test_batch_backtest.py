"""Batch backtest helpers."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.backtest import BacktestJob, BacktestJobResult
from app.models.user import User
from app.services.backtest_batch_service import build_batch_summary, parse_imported_symbols


def test_parse_imported_symbols_handles_text_and_csv() -> None:
    symbols = parse_imported_symbols(
        ["aapl", "$MSFT"],
        "symbol\nNVDA,AMD\nTSLA,Tesla Inc.\nBRK.B\n",
    )

    assert symbols == ["AAPL", "MSFT", "NVDA", "AMD", "TSLA", "BRK.B"]


def test_build_batch_summary_ranks_and_counts() -> None:
    job = BacktestJob(
        id="job-1",
        user_id=1,
        strategy_key="sma_cross",
        params={},
        timeframe="1Day",
        lookback_days=365,
        initial_capital=100_000,
        universes=["sp500"],
        symbols=["AAPL", "MSFT", "XYZ"],
        total_symbols=3,
        completed_symbols=3,
        succeeded_symbols=2,
        failed_symbols=1,
        status="completed",
        report={},
    )
    results = [
        BacktestJobResult(
            job_id="job-1",
            symbol="AAPL",
            status="completed",
            final_equity=110_000,
            total_return_pct=10,
            num_trades=4,
            win_rate_pct=50,
            max_drawdown_pct=4,
            sharpe=1.2,
            equity_curve=[],
            trades=[],
        ),
        BacktestJobResult(
            job_id="job-1",
            symbol="MSFT",
            status="completed",
            final_equity=95_000,
            total_return_pct=-5,
            num_trades=2,
            win_rate_pct=0,
            max_drawdown_pct=12,
            sharpe=-0.4,
            equity_curve=[],
            trades=[],
        ),
        BacktestJobResult(
            job_id="job-1",
            symbol="XYZ",
            status="failed",
            error="missing data",
            equity_curve=[],
            trades=[],
        ),
    ]

    summary = build_batch_summary(job, results)

    assert summary["average_return_pct"] == 2.5
    assert summary["median_return_pct"] == 2.5
    assert summary["total_trades"] == 6
    assert summary["best_return"][0]["symbol"] == "AAPL"
    assert summary["worst_return"][0]["symbol"] == "MSFT"
    assert summary["failures"] == [{"symbol": "XYZ", "error": "missing data"}]


def test_backtest_job_can_commit_with_user_foreign_key() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        db.add(User(id=1, email="test@example.com", hashed_password="x"))
        db.add(
            BacktestJob(
                id="job-1",
                user_id=1,
                strategy_key="sma_cross",
                params={},
                timeframe="1Day",
                lookback_days=365,
                initial_capital=100_000,
                universes=[],
                symbols=["AAPL"],
                total_symbols=1,
                status="queued",
                report={},
            )
        )
        db.commit()

        assert db.get(BacktestJob, "job-1") is not None
