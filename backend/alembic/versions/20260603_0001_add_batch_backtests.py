"""add batch backtest jobs

Revision ID: 20260603_0001
Revises:
Create Date: 2026-06-03 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260603_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "universe_symbols",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("universe", sa.String(length=32), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("source", sa.String(length=240), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("universe", "symbol", name="uq_universe_symbol"),
    )
    op.create_index(op.f("ix_universe_symbols_symbol"), "universe_symbols", ["symbol"], unique=False)
    op.create_index(op.f("ix_universe_symbols_universe"), "universe_symbols", ["universe"], unique=False)

    op.create_table(
        "backtest_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("strategy_key", sa.String(length=64), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("timeframe", sa.String(length=16), nullable=False),
        sa.Column("lookback_days", sa.Integer(), nullable=False),
        sa.Column("initial_capital", sa.Float(), nullable=False),
        sa.Column("universes", sa.JSON(), nullable=False),
        sa.Column("symbols", sa.JSON(), nullable=False),
        sa.Column("total_symbols", sa.Integer(), nullable=False),
        sa.Column("completed_symbols", sa.Integer(), nullable=False),
        sa.Column("succeeded_symbols", sa.Integer(), nullable=False),
        sa.Column("failed_symbols", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("queued", "running", "completed", "failed", "cancelled", name="backtest_job_status"),
            nullable=False,
        ),
        sa.Column("current_symbol", sa.String(length=16), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("rq_job_id", sa.String(length=128), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_backtest_jobs_status"), "backtest_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_backtest_jobs_strategy_key"), "backtest_jobs", ["strategy_key"], unique=False)
    op.create_index(op.f("ix_backtest_jobs_user_id"), "backtest_jobs", ["user_id"], unique=False)

    op.create_table(
        "backtest_job_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column(
            "status",
            sa.Enum("completed", "failed", "cancelled", name="backtest_result_status"),
            nullable=False,
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("final_equity", sa.Float(), nullable=True),
        sa.Column("total_return_pct", sa.Float(), nullable=True),
        sa.Column("num_trades", sa.Integer(), nullable=True),
        sa.Column("win_rate_pct", sa.Float(), nullable=True),
        sa.Column("max_drawdown_pct", sa.Float(), nullable=True),
        sa.Column("sharpe", sa.Float(), nullable=True),
        sa.Column("equity_curve", sa.JSON(), nullable=False),
        sa.Column("trades", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["backtest_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "symbol", name="uq_backtest_job_result"),
    )
    op.create_index(op.f("ix_backtest_job_results_job_id"), "backtest_job_results", ["job_id"], unique=False)
    op.create_index(op.f("ix_backtest_job_results_symbol"), "backtest_job_results", ["symbol"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_backtest_job_results_symbol"), table_name="backtest_job_results")
    op.drop_index(op.f("ix_backtest_job_results_job_id"), table_name="backtest_job_results")
    op.drop_table("backtest_job_results")
    op.drop_index(op.f("ix_backtest_jobs_user_id"), table_name="backtest_jobs")
    op.drop_index(op.f("ix_backtest_jobs_strategy_key"), table_name="backtest_jobs")
    op.drop_index(op.f("ix_backtest_jobs_status"), table_name="backtest_jobs")
    op.drop_table("backtest_jobs")
    op.drop_index(op.f("ix_universe_symbols_universe"), table_name="universe_symbols")
    op.drop_index(op.f("ix_universe_symbols_symbol"), table_name="universe_symbols")
    op.drop_table("universe_symbols")
    sa.Enum(name="backtest_result_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="backtest_job_status").drop(op.get_bind(), checkfirst=True)
