"""add market data pause resume state

Revision ID: 20260606_0006
Revises: 20260606_0005
Create Date: 2026-06-06 00:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260606_0006"
down_revision: str | None = "20260606_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "market_data_ingestion_jobs",
        sa.Column(
            "total_work_units",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "market_data_ingestion_jobs",
        sa.Column(
            "completed_work_units",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "market_data_ingestion_jobs",
        sa.Column(
            "pause_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "market_data_ingestion_jobs",
        sa.Column(
            "progress_state",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("market_data_ingestion_jobs", "progress_state")
    op.drop_column("market_data_ingestion_jobs", "pause_requested")
    op.drop_column("market_data_ingestion_jobs", "completed_work_units")
    op.drop_column("market_data_ingestion_jobs", "total_work_units")
