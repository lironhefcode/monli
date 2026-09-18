# Monli

Self-hosted metric monitoring system. See [PROJECT_PLAN.md](./PROJECT_PLAN.md)
for the full design (data model, policy resolution, agent design, API).

## Layout

- `backend/` — Node.js + TypeScript + Express API server (Postgres via Prisma).
- `frontend/` — Vue 3 + Nuxt UI (not yet implemented).
- `agent/` — Rust metric-collecting agent (not yet implemented).
- `nginx/` — reverse proxy config used by `docker compose`.

## Quick start (Docker)

```
cp .env.example .env          # set POSTGRES_PASSWORD at minimum
docker compose up -d --build
curl http://localhost:8080/health
```

This starts Postgres, the API, and nginx. Migrations run automatically when
the API container starts. The API is reachable at `http://localhost:8080`
(change with `HTTP_PORT` in `.env`).

For a real deployment, set `PUBLIC_API_URL` to the address your monitored
hosts can reach — it's embedded in the agent install command.

## Local development (backend outside Docker)

```
cp .env.example .env
docker compose up -d postgres   # just the database
npm install
cp backend/.env.example backend/.env
npm run prisma:migrate --workspace backend
npm run dev --workspace backend # http://localhost:3000
```

## Why nginx is in front of the API

Agents don't get a name typed in by an admin — a host's identity is its
reported hostname **plus the source IP of its registration request**, and
that IP is what decides whether a re-install re-binds to an existing target
or a new one is created. Trusting an IP the agent could set itself would let
one host impersonate another, so:

- The `api` container does **not** publish a port. All traffic enters through
  nginx, which appends the real client address to `X-Forwarded-For`.
- nginx is pinned to `172.28.0.10` and the API's `TRUST_PROXY` is set to
  exactly that address. Express then takes the client IP from the forwarded
  header *only* when the request came from nginx, and ignores any
  `X-Forwarded-For` a client sends on its own.

If you replace nginx with your own proxy or load balancer, keep both rules:
don't expose the API port directly, and set `TRUST_PROXY` (see
`backend/.env.example`) to your proxy's address or CIDR — never to `true`,
and never to a range that also contains the monitored hosts.

## Testing the enrollment flow by hand

```
# 1. Mint a single-use token (this is what the UI's "Install Agent" button does)
curl -X POST http://localhost:8080/agents/enrollment-tokens

# 2. Register as an agent would, exchanging the token for a target-bound API key
curl -X POST http://localhost:8080/agents/register \
  -H "X-Enrollment-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{"hostname":"web-01","os":"linux","arch":"x86_64"}'
```

Registering again with the same hostname from the same IP re-binds the
existing target and rotates its key; a different IP creates a new target.
The returned `installCommand` refers to `/agents/install.sh`, which doesn't
exist yet — the agent and its installer are still to be written.

## Database access

Postgres is published on `localhost:5432` (`POSTGRES_PORT`) with the
credentials from `.env`, so any client (psql, pgAdmin, DBeaver) can connect
directly. The tables to watch while testing are `targets` and
`enrollment_tokens`.