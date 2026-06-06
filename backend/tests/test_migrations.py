"""Migration coverage for a clean database."""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_alembic_upgrade_head_from_empty_database(tmp_path: Path) -> None:
    db_path = tmp_path / "migration.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        strategy_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(strategy_instances)").fetchall()
        }

    assert {
        "alembic_version",
        "users",
        "strategy_instances",
        "signals",
        "orders",
        "broker_tokens",
        "universe_symbols",
        "backtest_jobs",
        "backtest_job_results",
        "market_assets",
        "market_bars",
        "market_data_coverage",
        "market_data_ingestion_jobs",
    } <= tables
    assert {"last_run_at", "last_error"} <= strategy_columns


def test_init_db_seeds_fixed_development_user(tmp_path: Path) -> None:
    db_path = tmp_path / "init.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    subprocess.run(
        [sys.executable, "-m", "app.db.init_db"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT id, email FROM users WHERE id = 1").fetchone()

    assert row == (1, "dev@example.local")
