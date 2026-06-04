"""add automated strategy run metadata

Revision ID: 20260604_0002
Revises: 20260603_0001
Create Date: 2026-06-04 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260604_0002"
down_revision: str | None = "20260603_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("strategy_instances") as batch_op:
        batch_op.add_column(sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("last_error", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("strategy_instances") as batch_op:
        batch_op.drop_column("last_error")
        batch_op.drop_column("last_run_at")
