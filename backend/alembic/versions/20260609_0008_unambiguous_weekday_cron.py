"""use named weekdays for default strategy schedules

Revision ID: 20260609_0008
Revises: 20260609_0007
Create Date: 2026-06-09 00:08:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260609_0008"
down_revision: str | None = "20260609_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEDULE_REWRITES = {
    "55 10-15 * * 1-5": "55 10-15 * * mon-fri",
    "35 9 * * 1-5": "35 9 * * mon-fri",
    "55 15 * * 1-5": "55 15 * * mon-fri",
}


def upgrade() -> None:
    for old, new in SCHEDULE_REWRITES.items():
        op.execute(
            sa.text("UPDATE strategy_instances SET schedule = :new WHERE schedule = :old")
            .bindparams(old=old, new=new)
        )


def downgrade() -> None:
    for old, new in SCHEDULE_REWRITES.items():
        op.execute(
            sa.text("UPDATE strategy_instances SET schedule = :old WHERE schedule = :new")
            .bindparams(old=old, new=new)
        )
