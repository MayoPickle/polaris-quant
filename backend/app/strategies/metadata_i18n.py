"""Localized display metadata for built-in strategies."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.strategies.base import Strategy


STRATEGY_TRANSLATIONS: dict[str, dict[str, dict[str, Any]]] = {
    "zh-CN": {
        "sma_cross": {
            "name": "SMA 均线交叉",
            "description": "快 SMA 上穿慢 SMA 时买入；反向交叉时卖出。",
            "params": {
                "fast": "快线周期",
                "slow": "慢线周期",
                "qty": "下单数量",
            },
        },
        "rsi": {
            "name": "RSI 均值回归",
            "description": "RSI 跌破超卖阈值时买入；升破超买阈值时卖出。",
            "params": {
                "period": "RSI 周期",
                "oversold": "超卖阈值",
                "overbought": "超买阈值",
                "qty": "下单数量",
            },
        },
        "macd": {
            "name": "MACD 趋势跟随",
            "description": "MACD 线上穿信号线时买入；反向交叉时卖出。",
            "params": {
                "fast": "快 EMA 周期",
                "slow": "慢 EMA 周期",
                "signal": "信号 EMA 周期",
                "qty": "下单数量",
            },
        },
        "bollinger": {
            "name": "布林带均值回归",
            "description": "收盘价跌破下轨时买入；突破上轨时卖出。",
            "params": {
                "period": "计算周期",
                "num_std": "标准差倍数",
                "qty": "下单数量",
            },
        },
        "momentum": {
            "name": "动量 ROC",
            "description": "变动率高于入场阈值时买入；转负时卖出。",
            "params": {
                "period": "回看周期",
                "threshold": "入场阈值 %",
                "qty": "下单数量",
            },
        },
        "sma_stop": {
            "name": "SMA 均线交叉 + 止损",
            "description": "按 SMA 交叉入场，并在价格较开仓价下跌指定比例时止损离场。",
            "params": {
                "fast": "快线周期",
                "slow": "慢线周期",
                "stop_pct": "止损百分比",
                "qty": "下单数量",
            },
        },
    }
}


def localized_strategy_metadata(
    strategy_cls: type[Strategy], locale: str
) -> tuple[str, str, dict]:
    translation = STRATEGY_TRANSLATIONS.get(locale, {}).get(strategy_cls.key, {})
    param_schema = deepcopy(strategy_cls.param_schema)
    params = translation.get("params", {})
    properties = param_schema.get("properties", {})
    if isinstance(properties, dict):
        for param_name, title in params.items():
            spec = properties.get(param_name)
            if isinstance(spec, dict):
                spec["title"] = title
    return (
        translation.get("name", strategy_cls.name),
        translation.get("description", strategy_cls.description),
        param_schema,
    )
