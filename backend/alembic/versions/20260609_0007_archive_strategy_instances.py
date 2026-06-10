"""add strategy instance archive timestamp

Revision ID: 20260609_0007
Revises: 20260606_0006
Create Date: 2026-06-09 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260609_0007"
down_revision: str | None = "20260606_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("strategy_instances") as batch_op:
        batch_op.add_column(sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("strategy_instances") as batch_op:
        batch_op.drop_column("archived_at")
