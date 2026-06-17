"""add order stop prices and client ids

Revision ID: 20260617_0010
Revises: 20260610_0009
Create Date: 2026-06-17 00:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_0010"
down_revision: str | None = "20260610_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("client_order_id", sa.String(length=80), nullable=True))
    op.add_column("orders", sa.Column("stop_price", sa.Float(), nullable=True))
    op.create_index(
        "ix_orders_client_order_id",
        "orders",
        ["client_order_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_orders_client_order_id", table_name="orders")
    op.drop_column("orders", "stop_price")
    op.drop_column("orders", "client_order_id")
