# Polaris Quant

A quantitative trading platform: pick a strategy, configure it, and let a
scheduler run it against the market. Trading goes through a broker abstraction —
**Alpaca** is the first implementation (paper trading by default).

- **Frontend** — Next.js + Tailwind + shadcn/ui (English-only UI)
- **Backend** — FastAPI + SQLAlchemy + APScheduler
- **Database** — SQLite (dev) / PostgreSQL (prod)
- **Broker** — Alpaca (paper → live), behind a swappable `BrokerClient` interface

## Repository layout

```
polaris-quant/
├── backend/            # FastAPI API + strategy engine + worker  (see backend/README.md)
├── frontend/           # Next.js dashboard                       (see frontend/README.md)
├── docker-compose.yml  # Postgres + api + worker + frontend
├── compose.env.example # optional Docker Compose URL overrides
└── backend/.env.example
```

## Quick start (dev)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # fill in Alpaca keys + generate secrets
python -m app.db.init_db
uvicorn app.main:app --reload # http://localhost:8000/docs

# Frontend (separate terminal) — see frontend/README.md to scaffold first
cd frontend && npm run dev    # http://localhost:3000
```

## Production-like stack

```bash
cp compose.env.example .env   # edit host/IP values for your server
docker compose up -d --build  # Postgres + api + worker + frontend
```

The compose frontend is exposed at http://localhost:3001 to avoid colliding
with a local Next.js dev server on port 3000. PostgreSQL is only exposed inside
the Docker network, so it will not conflict with a host Postgres on port 5432.

## Safety

Automated trading is gated by a global kill-switch: `TRADING_ENABLED=false` by
default. Per-order and per-position notional limits live in `.env`. Start on
Alpaca **paper** (`ALPACA_ENV=paper`) and only switch to live deliberately.
