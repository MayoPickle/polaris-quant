"""add buy-and-hold benchmark metrics

Revision ID: 20260604_0003
Revises: 20260604_0002
Create Date: 2026-06-04 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260604_0003"
down_revision: str | None = "20260604_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("backtest_job_results") as batch_op:
        batch_op.add_column(sa.Column("buy_hold_return_pct", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("alpha_return_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("backtest_job_results") as batch_op:
        batch_op.drop_column("alpha_return_pct")
        batch_op.drop_column("buy_hold_return_pct")
