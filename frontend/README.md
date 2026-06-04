# Polaris Quant — Frontend

Next.js (App Router) + Tailwind CSS + shadcn/ui. English-only UI (no i18n).

## Scaffold

This directory holds reference files (`lib/`, `types/`) that match the backend.
Generate the Next.js app in place, then keep the structure below:

```bash
cd frontend
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
npx shadcn@latest init
npx shadcn@latest add button card dialog input table badge
```

Set the API base URL in `frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

## Target structure

```
frontend/
├── app/
│   ├── (auth)/login/
│   └── (dashboard)/
│       ├── strategies/      # pick & configure strategies
│       ├── portfolio/       # positions & P/L
│       ├── orders/          # order history
│       └── market/          # quotes
├── components/
│   ├── ui/                  # shadcn components
│   └── charts/
├── lib/
│   ├── api.ts               # backend client (provided)
│   └── utils.ts
├── hooks/
└── types/
    └── index.ts             # TS types mirroring backend schemas (provided)
```
