"""add market data cache

Revision ID: 20260606_0005
Revises: 20260605_0004
Create Date: 2026-06-06 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260606_0005"
down_revision: str | None = "20260605_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    if is_postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")

    op.create_table(
        "market_assets",
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("asset_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("asset_class", sa.String(length=32), nullable=False),
        sa.Column("exchange", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("tradable", sa.Boolean(), nullable=False),
        sa.Column("marginable", sa.Boolean(), nullable=False),
        sa.Column("shortable", sa.Boolean(), nullable=False),
        sa.Column("easy_to_borrow", sa.Boolean(), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("symbol"),
    )
    op.create_index(op.f("ix_market_assets_asset_class"), "market_assets", ["asset_class"], unique=False)
    op.create_index(op.f("ix_market_assets_exchange"), "market_assets", ["exchange"], unique=False)
    op.create_index(op.f("ix_market_assets_status"), "market_assets", ["status"], unique=False)

    op.create_table(
        "market_bars",
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("feed", sa.String(length=16), nullable=False),
        sa.Column("timeframe", sa.String(length=16), nullable=False),
        sa.Column("adjustment", sa.String(length=16), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Float(), nullable=False),
        sa.Column("high", sa.Float(), nullable=False),
        sa.Column("low", sa.Float(), nullable=False),
        sa.Column("close", sa.Float(), nullable=False),
        sa.Column("volume", sa.Float(), nullable=False),
        sa.Column("trade_count", sa.BigInteger(), nullable=True),
        sa.Column("vwap", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint(
            "provider",
            "feed",
            "timeframe",
            "adjustment",
            "symbol",
            "ts",
            name="pk_market_bars",
        ),
    )
    op.create_index(
        "ix_market_bars_lookup",
        "market_bars",
        ["provider", "feed", "timeframe", "adjustment", "symbol", "ts"],
        unique=False,
    )
    op.create_index("ix_market_bars_symbol_time", "market_bars", ["symbol", "timeframe", "ts"], unique=False)
    if is_postgres:
        op.execute(
            "SELECT create_hypertable('market_bars', 'ts', "
            "if_not_exists => TRUE, migrate_data => TRUE)"
        )
        op.execute(
            "ALTER TABLE market_bars SET ("
            "timescaledb.compress, "
            "timescaledb.compress_segmentby = 'provider,feed,timeframe,adjustment,symbol'"
            ")"
        )

    op.create_table(
        "market_data_coverage",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("feed", sa.String(length=16), nullable=False),
        sa.Column("timeframe", sa.String(length=16), nullable=False),
        sa.Column("adjustment", sa.String(length=16), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("first_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("row_count", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "feed",
            "timeframe",
            "adjustment",
            "symbol",
            name="uq_market_data_coverage_key",
        ),
    )
    op.create_index(op.f("ix_market_data_coverage_adjustment"), "market_data_coverage", ["adjustment"], unique=False)
    op.create_index(op.f("ix_market_data_coverage_feed"), "market_data_coverage", ["feed"], unique=False)
    op.create_index(op.f("ix_market_data_coverage_provider"), "market_data_coverage", ["provider"], unique=False)
    op.create_index(op.f("ix_market_data_coverage_symbol"), "market_data_coverage", ["symbol"], unique=False)
    op.create_index(op.f("ix_market_data_coverage_timeframe"), "market_data_coverage", ["timeframe"], unique=False)

    op.create_table(
        "market_data_ingestion_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("feed", sa.String(length=16), nullable=False),
        sa.Column("timeframe", sa.String(length=16), nullable=False),
        sa.Column("adjustment", sa.String(length=16), nullable=False),
        sa.Column("symbols", sa.JSON(), nullable=False),
        sa.Column("start_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("total_symbols", sa.Integer(), nullable=False),
        sa.Column("completed_symbols", sa.Integer(), nullable=False),
        sa.Column("current_symbol", sa.String(length=16), nullable=True),
        sa.Column("cursor", sa.Text(), nullable=True),
        sa.Column("requested_rows", sa.BigInteger(), nullable=False),
        sa.Column("inserted_rows", sa.BigInteger(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("rq_job_id", sa.String(length=128), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_market_data_ingestion_jobs_adjustment"), "market_data_ingestion_jobs", ["adjustment"], unique=False)
    op.create_index(op.f("ix_market_data_ingestion_jobs_feed"), "market_data_ingestion_jobs", ["feed"], unique=False)
    op.create_index(op.f("ix_market_data_ingestion_jobs_kind"), "market_data_ingestion_jobs", ["kind"], unique=False)
    op.create_index(op.f("ix_market_data_ingestion_jobs_provider"), "market_data_ingestion_jobs", ["provider"], unique=False)
    op.create_index(op.f("ix_market_data_ingestion_jobs_status"), "market_data_ingestion_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_market_data_ingestion_jobs_timeframe"), "market_data_ingestion_jobs", ["timeframe"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_market_data_ingestion_jobs_timeframe"), table_name="market_data_ingestion_jobs")
    op.drop_index(op.f("ix_market_data_ingestion_jobs_status"), table_name="market_data_ingestion_jobs")
    op.drop_index(op.f("ix_market_data_ingestion_jobs_provider"), table_name="market_data_ingestion_jobs")
    op.drop_index(op.f("ix_market_data_ingestion_jobs_kind"), table_name="market_data_ingestion_jobs")
    op.drop_index(op.f("ix_market_data_ingestion_jobs_feed"), table_name="market_data_ingestion_jobs")
    op.drop_index(op.f("ix_market_data_ingestion_jobs_adjustment"), table_name="market_data_ingestion_jobs")
    op.drop_table("market_data_ingestion_jobs")

    op.drop_index(op.f("ix_market_data_coverage_timeframe"), table_name="market_data_coverage")
    op.drop_index(op.f("ix_market_data_coverage_symbol"), table_name="market_data_coverage")
    op.drop_index(op.f("ix_market_data_coverage_provider"), table_name="market_data_coverage")
    op.drop_index(op.f("ix_market_data_coverage_feed"), table_name="market_data_coverage")
    op.drop_index(op.f("ix_market_data_coverage_adjustment"), table_name="market_data_coverage")
    op.drop_table("market_data_coverage")

    op.drop_index("ix_market_bars_symbol_time", table_name="market_bars")
    op.drop_index("ix_market_bars_lookup", table_name="market_bars")
    op.drop_table("market_bars")

    op.drop_index(op.f("ix_market_assets_status"), table_name="market_assets")
    op.drop_index(op.f("ix_market_assets_exchange"), table_name="market_assets")
    op.drop_index(op.f("ix_market_assets_asset_class"), table_name="market_assets")
    op.drop_table("market_assets")
