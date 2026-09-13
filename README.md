# Monli

Self-hosted metric monitoring system. See [PROJECT_PLAN.md](./PROJECT_PLAN.md)
for the full design (data model, policy resolution, agent design, API).

## Layout

- `backend/` — Node.js + TypeScript + Express API server (Postgres via Prisma).
- `frontend/` — Vue 3 + Nuxt UI (not yet implemented).
- `agent/` — Rust metric-collecting agent (not yet implemented).

## Getting started (backend)

```
docker compose up -d          # start local Postgres
npm install                   # install workspace deps
cp backend/.env.example backend/.env
npm run prisma:migrate --workspace backend
npm run dev --workspace backend
```
