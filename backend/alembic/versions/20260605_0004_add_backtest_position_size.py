"""add backtest position size

Revision ID: 20260605_0004
Revises: 20260604_0003
Create Date: 2026-06-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260605_0004"
down_revision: str | None = "20260604_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_POSITION_SIZING = {
    "method": "fixed_target",
    "target_pct": 100,
    "risk_amount": 1_000,
    "stop_loss_pct": 5,
    "atr_period": 14,
    "atr_multiple": 2,
    "tranche_pct": 10,
    "max_position_pct": 100,
    "universe_size": 10,
    "target_volatility_pct": 12,
    "volatility_lookback": 20,
}


def upgrade() -> None:
    with op.batch_alter_table("backtest_jobs") as batch_op:
        batch_op.add_column(
            sa.Column(
                "position_size_pct",
                sa.Float(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "position_sizing",
                sa.JSON(),
                nullable=True,
            )
        )
    op.execute(
        sa.text(
            "UPDATE backtest_jobs "
            "SET position_size_pct = 100 "
            "WHERE position_size_pct IS NULL"
        )
    )
    op.execute(
        sa.text(
            "UPDATE backtest_jobs SET position_sizing = :position_sizing "
            "WHERE position_sizing IS NULL"
        ).bindparams(
            sa.bindparam(
                "position_sizing",
                value=_LEGACY_POSITION_SIZING,
                type_=sa.JSON(),
            )
        )
    )
    with op.batch_alter_table("backtest_jobs") as batch_op:
        batch_op.alter_column(
            "position_size_pct",
            existing_type=sa.Float(),
            nullable=False,
            server_default="20",
        )
        batch_op.alter_column(
            "position_sizing",
            existing_type=sa.JSON(),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("backtest_jobs") as batch_op:
        batch_op.drop_column("position_sizing")
        batch_op.drop_column("position_size_pct")
