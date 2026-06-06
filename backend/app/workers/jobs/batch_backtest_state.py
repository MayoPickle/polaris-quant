"""Database row mutation helpers for batch backtest workers."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.backtest import BacktestJob, BacktestJobResult


def replace_result(db: Session, row: BacktestJobResult) -> None:
    existing = (
        db.query(BacktestJobResult)
        .filter(BacktestJobResult.job_id == row.job_id, BacktestJobResult.symbol == row.symbol)
        .one_or_none()
    )
    if existing:
        existing.status = row.status
        existing.error = row.error
        existing.final_equity = row.final_equity
        existing.total_return_pct = row.total_return_pct
        existing.buy_hold_return_pct = row.buy_hold_return_pct
        existing.alpha_return_pct = row.alpha_return_pct
        existing.num_trades = row.num_trades
        existing.win_rate_pct = row.win_rate_pct
        existing.max_drawdown_pct = row.max_drawdown_pct
        existing.sharpe = row.sharpe
        existing.equity_curve = row.equity_curve
        existing.trades = row.trades
    else:
        db.add(row)


def mark_cancelled(db: Session, job: BacktestJob) -> None:
    job.status = "cancelled"
    job.current_symbol = None
    job.ended_at = datetime.now(timezone.utc)
    db.commit()

