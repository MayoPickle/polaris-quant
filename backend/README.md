# Polaris Quant — Backend

FastAPI + SQLAlchemy + APScheduler. Broker-agnostic core with an Alpaca
implementation. SQLite in dev, PostgreSQL in prod.

## Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env        # then fill in Alpaca keys + generate secrets
```

Generate the two required secrets and put them in `.env`:

```bash
openssl rand -hex 32                                              # -> SECRET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # -> ENCRYPTION_KEY
```

## Run (dev, SQLite)

```bash
python -m app.db.init_db        # create tables (dev convenience)
uvicorn app.main:app --reload   # web process  -> http://localhost:8000/docs
python -m app.workers.runtime   # worker process (separate terminal)
```

## Migrations (Alembic)

```bash
alembic revision --autogenerate -m "init schema"
alembic upgrade head
```

## Tests

```bash
pytest        # smoke tests; do not hit the broker network
```

## Layout

```
app/
├── main.py            # FastAPI app (web process)
├── core/              # config, security (JWT + Fernet), logging
├── db/                # engine/session, Base, Alembic target metadata
├── models/            # SQLAlchemy ORM tables
├── schemas/           # Pydantic DTOs
├── api/v1/endpoints/  # health, strategies, orders, positions, market
├── services/          # order_service (risk -> broker -> persist)
├── brokers/           # base.BrokerClient + alpaca/ + factory
├── strategies/        # base + registry + engine + builtin/
├── risk/              # pre-trade RiskGuard (kill-switch + limits)
└── workers/           # APScheduler runtime + jobs (worker process)
```

## Key design points

- **Broker abstraction** — everything depends on `brokers.base.BrokerClient`.
  Alpaca is one implementation; add others under `brokers/` without touching
  business logic.
- **Risk guard** — `services.order_service.place_order` is the only path to the
  broker, and it always runs `risk.guard.RiskGuard` first. `TRADING_ENABLED` is
  a global kill-switch (default off).
- **Two processes** — the web API and the strategy scheduler run separately but
  share code and the database.
