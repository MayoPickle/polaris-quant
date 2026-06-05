"""Event-driven backtest engine.

Walks bars forward one at a time, feeding the strategy the data available up to
that point (no look-ahead), and simulates a long-only book. A buy signal is
translated through a position sizing model, and a sell signal liquidates the
position. Produces an equity curve plus summary performance metrics.

Assumptions (documented so results are interpretable):
- Fills happen at the signal bar's close, no slippage or commission.
- Long-only, whole shares.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

from app.brokers.base import Bar
from app.strategies.base import Strategy
from app.strategies.position_sizing import (
    calculate_buy_quantity,
    normalize_position_sizing,
    position_sizing_summary_pct,
)

# Annualization factor per timeframe, for the Sharpe ratio.
_PERIODS_PER_YEAR = {"1Day": 252, "1Hour": 252 * 7, "1Min": 252 * 390}


@dataclass
class Trade:
    entry_time: str
    exit_time: str
    qty: int
    entry_price: float
    exit_price: float
    pnl: float
    return_pct: float


@dataclass
class BacktestResult:
    symbol: str
    strategy_key: str
    initial_capital: float
    position_size_pct: float
    position_sizing: dict
    final_equity: float
    total_return_pct: float
    buy_hold_return_pct: float
    alpha_return_pct: float
    num_trades: int
    win_rate_pct: float
    max_drawdown_pct: float
    sharpe: float
    equity_curve: list[dict] = field(default_factory=list)  # {timestamp, equity}
    trades: list[dict] = field(default_factory=list)


def _max_drawdown(equity: list[float]) -> float:
    peak = -math.inf
    max_dd = 0.0
    for e in equity:
        peak = max(peak, e)
        if peak > 0:
            max_dd = max(max_dd, (peak - e) / peak)
    return max_dd * 100


def _sharpe(equity: list[float], periods_per_year: int) -> float:
    if len(equity) < 3:
        return 0.0
    rets = [
        equity[i] / equity[i - 1] - 1
        for i in range(1, len(equity))
        if equity[i - 1] > 0
    ]
    if len(rets) < 2:
        return 0.0
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    std = math.sqrt(var)
    if std == 0:
        return 0.0
    return (mean / std) * math.sqrt(periods_per_year)


def _buy_hold_return(
    bars: list[Bar],
    *,
    initial_capital: float,
    position_sizing: dict,
    timeframe: str,
) -> float:
    if len(bars) < 2 or bars[0].close <= 0:
        return 0.0
    cash = initial_capital
    shares = calculate_buy_quantity(
        config=position_sizing,
        bars=bars[:1],
        cash=cash,
        shares=0,
        close=bars[0].close,
        timeframe=timeframe,
        benchmark=True,
    )
    cash -= shares * bars[0].close
    final_equity = cash + shares * bars[-1].close
    return (final_equity / initial_capital - 1) * 100


def run_backtest(
    strategy: Strategy,
    symbol: str,
    bars: list[Bar],
    *,
    timeframe: str = "1Day",
    initial_capital: float = 100_000.0,
    position_size_pct: float = 20.0,
    position_sizing: dict | None = None,
) -> BacktestResult:
    sizing = normalize_position_sizing(
        position_sizing,
        fallback_position_size_pct=position_size_pct,
    )
    display_position_size_pct = position_sizing_summary_pct(sizing)
    cash = initial_capital
    shares = 0
    entry_price = 0.0
    entry_time = ""
    equity_curve: list[dict] = []
    trades: list[Trade] = []

    for i in range(len(bars)):
        window = bars[: i + 1]
        close = bars[i].close
        ts = bars[i].timestamp

        signal = next(
            (s for s in strategy.generate_signals({symbol: window}) if s.symbol == symbol),
            None,
        )
        if signal:
            if signal.side == "buy" and shares == 0 and close > 0:
                buy_qty = calculate_buy_quantity(
                    config=sizing,
                    bars=window,
                    cash=cash,
                    shares=shares,
                    close=close,
                    timeframe=timeframe,
                )
                if buy_qty > 0:
                    cash -= buy_qty * close
                    shares = buy_qty
                    entry_price, entry_time = close, ts
            elif signal.side == "buy" and shares > 0:
                buy_qty = calculate_buy_quantity(
                    config=sizing,
                    bars=window,
                    cash=cash,
                    shares=shares,
                    close=close,
                    timeframe=timeframe,
                )
                if buy_qty > 0:
                    total_cost = entry_price * shares + buy_qty * close
                    shares += buy_qty
                    cash -= buy_qty * close
                    entry_price = total_cost / shares
            elif signal.side == "sell" and shares > 0:
                cash += shares * close
                pnl = (close - entry_price) * shares
                trades.append(
                    Trade(
                        entry_time=entry_time,
                        exit_time=ts,
                        qty=shares,
                        entry_price=entry_price,
                        exit_price=close,
                        pnl=round(pnl, 2),
                        return_pct=round((close / entry_price - 1) * 100, 2),
                    )
                )
                shares, entry_price, entry_time = 0, 0.0, ""

        equity_curve.append({"timestamp": ts, "equity": round(cash + shares * close, 2)})

    # Liquidate any open position at the final close.
    if shares > 0 and bars:
        close, ts = bars[-1].close, bars[-1].timestamp
        cash += shares * close
        pnl = (close - entry_price) * shares
        trades.append(
            Trade(
                entry_time=entry_time,
                exit_time=ts,
                qty=shares,
                entry_price=entry_price,
                exit_price=close,
                pnl=round(pnl, 2),
                return_pct=round((close / entry_price - 1) * 100, 2),
            )
        )

    equity_values = [p["equity"] for p in equity_curve] or [initial_capital]
    final_equity = equity_values[-1]
    total_return_pct = round((final_equity / initial_capital - 1) * 100, 2)
    buy_hold_return_pct = round(
        _buy_hold_return(
            bars,
            initial_capital=initial_capital,
            position_sizing=sizing,
            timeframe=timeframe,
        ),
        2,
    )
    wins = sum(1 for t in trades if t.pnl > 0)

    return BacktestResult(
        symbol=symbol,
        strategy_key=strategy.key,
        initial_capital=initial_capital,
        position_size_pct=display_position_size_pct,
        position_sizing=sizing,
        final_equity=round(final_equity, 2),
        total_return_pct=total_return_pct,
        buy_hold_return_pct=buy_hold_return_pct,
        alpha_return_pct=round(total_return_pct - buy_hold_return_pct, 2),
        num_trades=len(trades),
        win_rate_pct=round(wins / len(trades) * 100, 2) if trades else 0.0,
        max_drawdown_pct=round(_max_drawdown(equity_values), 2),
        sharpe=round(_sharpe(equity_values, _PERIODS_PER_YEAR.get(timeframe, 252)), 2),
        equity_curve=equity_curve,
        trades=[asdict(t) for t in trades],
    )
