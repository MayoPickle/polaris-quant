"""Batch backtest result conversion and report aggregation."""

from __future__ import annotations

from statistics import median

from app.models.backtest import BacktestJob, BacktestJobResult
from app.strategies.backtest import BacktestResult


def result_from_backtest(job_id: str, result: BacktestResult) -> BacktestJobResult:
    return BacktestJobResult(
        job_id=job_id,
        symbol=result.symbol,
        status="completed",
        final_equity=result.final_equity,
        total_return_pct=result.total_return_pct,
        buy_hold_return_pct=result.buy_hold_return_pct,
        alpha_return_pct=result.alpha_return_pct,
        num_trades=result.num_trades,
        win_rate_pct=result.win_rate_pct,
        max_drawdown_pct=result.max_drawdown_pct,
        sharpe=result.sharpe,
        equity_curve=result.equity_curve,
        trades=result.trades,
    )


def failed_result(job_id: str, symbol: str, error: str) -> BacktestJobResult:
    return BacktestJobResult(job_id=job_id, symbol=symbol, status="failed", error=error)


def build_batch_summary(job: BacktestJob, results: list[BacktestJobResult]) -> dict:
    completed = [r for r in results if r.status == "completed"]
    failed = [r for r in results if r.status == "failed"]
    returns = [r.total_return_pct for r in completed if r.total_return_pct is not None]
    buy_hold_returns = [
        r.buy_hold_return_pct for r in completed if r.buy_hold_return_pct is not None
    ]
    alphas = [r.alpha_return_pct for r in completed if r.alpha_return_pct is not None]
    sharpes = [r.sharpe for r in completed if r.sharpe is not None]
    drawdowns = [r.max_drawdown_pct for r in completed if r.max_drawdown_pct is not None]

    by_return = sorted(
        completed,
        key=lambda r: r.total_return_pct if r.total_return_pct is not None else float("-inf"),
        reverse=True,
    )
    by_sharpe = sorted(
        completed,
        key=lambda r: r.sharpe if r.sharpe is not None else float("-inf"),
        reverse=True,
    )
    by_alpha = sorted(
        completed,
        key=lambda r: r.alpha_return_pct if r.alpha_return_pct is not None else float("-inf"),
        reverse=True,
    )
    by_drawdown = sorted(
        completed,
        key=lambda r: r.max_drawdown_pct if r.max_drawdown_pct is not None else float("inf"),
    )
    median_symbol = _median_return_symbol(by_return)

    return {
        "status": job.status,
        "total_symbols": job.total_symbols,
        "completed_symbols": job.completed_symbols,
        "succeeded_symbols": job.succeeded_symbols,
        "failed_symbols": job.failed_symbols,
        "average_return_pct": round(sum(returns) / len(returns), 2) if returns else 0.0,
        "average_buy_hold_return_pct": (
            round(sum(buy_hold_returns) / len(buy_hold_returns), 2)
            if buy_hold_returns
            else 0.0
        ),
        "average_alpha_return_pct": round(sum(alphas) / len(alphas), 2) if alphas else 0.0,
        "median_return_pct": round(median(returns), 2) if returns else 0.0,
        "average_sharpe": round(sum(sharpes) / len(sharpes), 2) if sharpes else 0.0,
        "average_max_drawdown_pct": round(sum(drawdowns) / len(drawdowns), 2) if drawdowns else 0.0,
        "total_trades": sum(r.num_trades or 0 for r in completed),
        "best_return": _rank_rows(by_return[:10]),
        "worst_return": _rank_rows(list(reversed(by_return[-10:]))),
        "best_alpha": _rank_rows(by_alpha[:10]),
        "best_sharpe": _rank_rows(by_sharpe[:10]),
        "lowest_drawdown": _rank_rows(by_drawdown[:10]),
        "representative_symbols": {
            "best": by_return[0].symbol if by_return else None,
            "median": median_symbol,
            "worst": by_return[-1].symbol if by_return else None,
        },
        "return_distribution": _distribution(returns),
        "failures": [{"symbol": r.symbol, "error": r.error} for r in failed[:100]],
    }


def _rank_rows(results: list[BacktestJobResult]) -> list[dict]:
    return [
        {
            "symbol": r.symbol,
            "total_return_pct": r.total_return_pct,
            "buy_hold_return_pct": r.buy_hold_return_pct,
            "alpha_return_pct": r.alpha_return_pct,
            "sharpe": r.sharpe,
            "max_drawdown_pct": r.max_drawdown_pct,
            "win_rate_pct": r.win_rate_pct,
            "num_trades": r.num_trades,
            "final_equity": r.final_equity,
        }
        for r in results
    ]


def _median_return_symbol(results_desc: list[BacktestJobResult]) -> str | None:
    if not results_desc:
        return None
    return results_desc[len(results_desc) // 2].symbol


def _distribution(values: list[float]) -> list[dict[str, float | int | str]]:
    if not values:
        return []
    low = min(values)
    high = max(values)
    if low == high:
        return [{"range": f"{round(low, 2)}%", "count": len(values), "start": low, "end": high}]

    bucket_count = min(12, max(4, int(len(values) ** 0.5)))
    width = (high - low) / bucket_count
    buckets = [0 for _ in range(bucket_count)]
    for value in values:
        index = min(bucket_count - 1, int((value - low) / width))
        buckets[index] += 1
    return [
        {
            "range": f"{round(low + i * width, 1)}% to {round(low + (i + 1) * width, 1)}%",
            "start": round(low + i * width, 2),
            "end": round(low + (i + 1) * width, 2),
            "count": count,
        }
        for i, count in enumerate(buckets)
    ]

