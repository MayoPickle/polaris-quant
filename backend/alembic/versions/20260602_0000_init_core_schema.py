"""init core schema

Revision ID: 20260602_0000
Revises:
Create Date: 2026-06-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260602_0000"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "broker_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("broker", sa.String(length=32), nullable=False),
        sa.Column("env", sa.String(length=16), nullable=False),
        sa.Column("api_key", sa.String(length=255), nullable=False),
        sa.Column("api_secret_encrypted", sa.String(length=512), nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "broker", "env", name="uq_user_broker_env"),
    )
    op.create_index(op.f("ix_broker_tokens_user_id"), "broker_tokens", ["user_id"], unique=False)

    op.create_table(
        "strategy_instances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("strategy_key", sa.String(length=64), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("symbols", sa.JSON(), nullable=False),
        sa.Column("schedule", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_strategy_instances_strategy_key"),
        "strategy_instances",
        ["strategy_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_strategy_instances_user_id"),
        "strategy_instances",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("strategy_instance_id", sa.Integer(), nullable=True),
        sa.Column("broker_order_id", sa.String(length=64), nullable=True),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("side", sa.Enum("buy", "sell", name="order_side"), nullable=False),
        sa.Column(
            "order_type",
            sa.Enum("market", "limit", "stop", "stop_limit", name="order_type"),
            nullable=False,
        ),
        sa.Column("qty", sa.Float(), nullable=False),
        sa.Column("limit_price", sa.Float(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "new",
                "accepted",
                "filled",
                "partially_filled",
                "canceled",
                "rejected",
                name="order_status",
            ),
            nullable=False,
        ),
        sa.Column("filled_qty", sa.Float(), nullable=False),
        sa.Column("filled_avg_price", sa.Float(), nullable=True),
        sa.Column("raw", sa.JSON(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["strategy_instance_id"], ["strategy_instances.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_orders_broker_order_id"), "orders", ["broker_order_id"], unique=False)
    op.create_index(op.f("ix_orders_status"), "orders", ["status"], unique=False)
    op.create_index(op.f("ix_orders_strategy_instance_id"), "orders", ["strategy_instance_id"], unique=False)
    op.create_index(op.f("ix_orders_symbol"), "orders", ["symbol"], unique=False)
    op.create_index(op.f("ix_orders_user_id"), "orders", ["user_id"], unique=False)

    op.create_table(
        "signals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("strategy_instance_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("side", sa.Enum("buy", "sell", "hold", name="signal_side"), nullable=False),
        sa.Column("qty", sa.Float(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["strategy_instance_id"], ["strategy_instances.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_signals_strategy_instance_id"), "signals", ["strategy_instance_id"], unique=False)
    op.create_index(op.f("ix_signals_symbol"), "signals", ["symbol"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_signals_symbol"), table_name="signals")
    op.drop_index(op.f("ix_signals_strategy_instance_id"), table_name="signals")
    op.drop_table("signals")
    op.drop_index(op.f("ix_orders_user_id"), table_name="orders")
    op.drop_index(op.f("ix_orders_symbol"), table_name="orders")
    op.drop_index(op.f("ix_orders_strategy_instance_id"), table_name="orders")
    op.drop_index(op.f("ix_orders_status"), table_name="orders")
    op.drop_index(op.f("ix_orders_broker_order_id"), table_name="orders")
    op.drop_table("orders")
    op.drop_index(op.f("ix_strategy_instances_user_id"), table_name="strategy_instances")
    op.drop_index(op.f("ix_strategy_instances_strategy_key"), table_name="strategy_instances")
    op.drop_table("strategy_instances")
    op.drop_index(op.f("ix_broker_tokens_user_id"), table_name="broker_tokens")
    op.drop_table("broker_tokens")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    sa.Enum(name="signal_side").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="order_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="order_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="order_side").drop(op.get_bind(), checkfirst=True)
