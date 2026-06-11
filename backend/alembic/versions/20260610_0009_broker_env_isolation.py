"""add broker environment isolation

Revision ID: 20260610_0009
Revises: 20260609_0008
Create Date: 2026-06-10 00:09:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260610_0009"
down_revision: str | None = "20260609_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(
            sa.Column("broker_env", sa.String(length=16), nullable=False, server_default="paper")
        )
        batch_op.create_index("ix_orders_broker_env", ["broker_env"])

    with op.batch_alter_table("strategy_instances") as batch_op:
        batch_op.add_column(
            sa.Column("broker_env", sa.String(length=16), nullable=False, server_default="paper")
        )
        batch_op.create_index("ix_strategy_instances_broker_env", ["broker_env"])


def downgrade() -> None:
    with op.batch_alter_table("strategy_instances") as batch_op:
        batch_op.drop_index("ix_strategy_instances_broker_env")
        batch_op.drop_column("broker_env")

    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_index("ix_orders_broker_env")
        batch_op.drop_column("broker_env")
