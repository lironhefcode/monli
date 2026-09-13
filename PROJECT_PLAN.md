# Metric Monitoring System — Project Plan

## Purpose

A self-hosted monitoring system where lightweight agents report metrics to a
central server based on configurable templates and per-target policies. The
server evaluates incoming readings against alert policies, raises alerts with
full incident-response metadata, and exposes a UI for live alerts and
historical metric charts.

## Stack

- **Backend**: Node.js + TypeScript (Express or Fastify)
- **Frontend**: Vue 3 + Nuxt (Composition API, TypeScript)
- **Database**: PostgreSQL (plain SQL tables — no TSDB, not needed at this scale)
- **Agent**: Rust (async, via `tokio`), distributed as a static binary
- **Agent → Server transport**: HTTP push (agent POSTs on its own schedule)
- **Server → Browser live updates**: SSE or WebSocket for live alert feed

## Core Concepts

- **Metric**: a reusable, catalog-level definition of something measurable
  (e.g. `cpu_percent`, `ping_latency_ms`). Defined once, reused everywhere.
- **Metric Template**: a named, reusable bundle of metrics (e.g. "Linux host",
  "Ping check") used purely for **mass-applying** metrics to targets in the
  UI. Templates carry _suggested default_ policies per metric, but are not
  referenced by readings/alerts/overrides — they're an organizational
  convenience, not part of the runtime policy resolution path.
- **Target**: a monitored host/service. Has its own identity (name, type, IP,
  description, status) and can have **multiple templates** assigned
  (many-to-many). A target's effective set of monitored metrics is the
  **union of metrics from all its assigned templates**.
- **Target Metric Override**: a per-`(target, metric)` override of policy
  and/or response metadata. Template-agnostic — keyed directly on
  `(target_id, metric_id)`, not on which template introduced the metric.
  A target can only have an override for a metric it already inherits via
  at least one assigned template (enforced at the app layer).
- **Alert**: created when a metric breach is detected. Snapshots the fully
  resolved policy + response metadata at the moment it fires (frozen copy,
  not live references) so historical alerts don't silently change if
  templates/targets are edited later. Tracks first-response (ack) separately
  from resolution, to support MTTA/MTTR-style reporting later.

## Policy Resolution (fallback chain, narrowest wins)

For any given `(target, metric)`, each policy field (condition, threshold,
consecutive_breaches, severity, responsible_team, alert_subject,
alert_description, priority) resolves in this order:

1. `target_metric_overrides` row for this `(target, metric)` — if a field is
   set (non-null), use it.
2. `targets.responsible_team` — target-level default (used only for the
   `responsible_team` field; e.g. "ping alerts route to Network team" via an
   override, but everything else on the host defaults to the target's team).
3. `template_metrics` — the suggested default from whichever assigned
   template introduced this metric (deterministic tie-break, e.g. lowest
   `template_metrics.id`, if more than one template defines the same metric).

`consecutive_breaches` exists specifically to prevent alert flapping — a
metric must breach N consecutive reports before an alert opens.

## Target Status (derived, not agent-set)

`targets.status` ('up' / 'down' / 'unknown') is **not** set directly by the
agent. Instead:

- Every successful ingest updates `targets.last_seen_at = now()`.
- A target is considered `down` if `now() - last_seen_at` exceeds some
  multiple of its metrics' reporting intervals (checked via a scheduled job
  or computed at read time).

## Database Schema (PostgreSQL)

```sql
-- Catalog: reusable metric definitions
CREATE TABLE metrics (
  id          SERIAL PRIMARY KEY,
  metric_key  TEXT NOT NULL UNIQUE,     -- e.g. "cpu_percent", "ping_latency_ms"
  unit        TEXT,
  description TEXT
);

-- Templates: pure organizational bundles for mass-applying metrics
CREATE TABLE metric_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Join table: metrics in a template + that template's suggested defaults
CREATE TABLE template_metrics (
  id                    SERIAL PRIMARY KEY,
  template_id           INTEGER NOT NULL REFERENCES metric_templates(id) ON DELETE CASCADE,
  metric_id             INTEGER NOT NULL REFERENCES metrics(id),
  report_interval_sec   INTEGER NOT NULL DEFAULT 60,
  condition             TEXT NOT NULL,      -- 'gt' | 'lt' | 'gte' | 'lte' | 'eq'
  threshold             DOUBLE PRECISION NOT NULL,
  consecutive_breaches  INTEGER NOT NULL DEFAULT 1,
  severity              TEXT NOT NULL DEFAULT 'warning',   -- 'warning' | 'critical'
  responsible_team      TEXT,
  alert_subject         TEXT NOT NULL DEFAULT '',
  alert_description     TEXT,
  priority              TEXT NOT NULL DEFAULT 'p3',        -- 'p1'..'p4'
  UNIQUE (template_id, metric_id)
);

-- Targets: monitored hosts/services
CREATE TABLE targets (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,          -- 'host' | 'service' | 'database' | 'network_device' etc.
  ip_address        INET,
  description       TEXT,
  responsible_team  TEXT,                   -- target-level default team
  status            TEXT NOT NULL DEFAULT 'unknown',  -- 'up' | 'down' | 'unknown', derived
  last_seen_at      TIMESTAMPTZ,
  api_key_hash      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which templates a target pulls metrics from (many-to-many)
CREATE TABLE target_templates (
  id           SERIAL PRIMARY KEY,
  target_id    INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  template_id  INTEGER NOT NULL REFERENCES metric_templates(id) ON DELETE CASCADE,
  UNIQUE (target_id, template_id)
);

-- Per-(target, metric) override, template-agnostic.
-- App-layer rule: metric_id must already be reachable via one of the
-- target's assigned templates before an override can be created.
CREATE TABLE target_metric_overrides (
  id                    SERIAL PRIMARY KEY,
  target_id             INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  metric_id             INTEGER NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  report_interval_sec   INTEGER,
  condition             TEXT,
  threshold             DOUBLE PRECISION,
  consecutive_breaches  INTEGER,
  severity              TEXT,
  responsible_team      TEXT,
  alert_subject         TEXT,
  alert_description     TEXT,
  priority              TEXT,
  UNIQUE (target_id, metric_id)
);

-- Time-series data
CREATE TABLE metric_readings (
  id           BIGSERIAL PRIMARY KEY,
  target_id    INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  metric_id    INTEGER NOT NULL REFERENCES metrics(id),
  value        DOUBLE PRECISION NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_readings_target_metric_time
  ON metric_readings (target_id, metric_id, recorded_at DESC);

-- Alerts: snapshot of resolved policy + response metadata at breach time
CREATE TABLE alerts (
  id                    SERIAL PRIMARY KEY,
  target_id             INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  metric_id             INTEGER NOT NULL REFERENCES metrics(id),
  triggered_value       DOUBLE PRECISION NOT NULL,
  severity              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'resolved'
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  responsible_team      TEXT NOT NULL,     -- resolved value, frozen at fire time
  subject               TEXT NOT NULL,
  description           TEXT,
  priority               TEXT NOT NULL,
  first_response_at     TIMESTAMPTZ,
  first_response_by     TEXT,
  first_response_note   TEXT
);
CREATE INDEX idx_alerts_status ON alerts (status);
CREATE INDEX idx_alerts_target ON alerts (target_id);
```

## Agent Design (Rust)

The agent is intentionally "dumb" — all policy, thresholds, routing, and
priorities live server-side. The agent only knows _what_ to measure and _how
often_.

**Lifecycle:**

1. Load config (server URL + target API key) from env/config file.
2. `GET /targets/:id/metrics` → flat list of `{ metric_key, report_interval_sec }`.
   No template/policy info is exposed to the agent.
3. Run independent per-metric timers (metrics have different intervals).
4. On each tick, run the matching collector, then
   `POST /targets/:id/metrics` with `{ metric_key, value, recorded_at }`,
   authenticated via API key header.
5. Periodically re-fetch the metric list so config changes propagate without
   requiring an agent restart.

**Suggested structure:**

```
agent/
  Cargo.toml
  src/
    main.rs          -- entrypoint: load config, fetch metric list, start scheduler
    config.rs         -- server URL + API key
    api_client.rs      -- GET/POST calls (reqwest)
    scheduler.rs        -- per-metric interval tracking (tokio)
    collectors/
      mod.rs             -- Collector trait + registry
      cpu_percent.rs
      disk_used_pct.rs
      ping_latency_ms.rs
```

**Suggested crates:** `tokio`, `reqwest`, `serde`/`serde_json`, `sysinfo`,
`async-trait`.

**Collector abstraction:**

```rust
#[async_trait::async_trait]
trait Collector {
    async fn collect(&self) -> anyhow::Result<f64>;
}
```

A `HashMap<String, Box<dyn Collector>>` keyed by `metric_key` acts as the
registry (Strategy pattern). Unknown `metric_key`s (server knows about a
metric the agent has no collector for) should be skipped with a warning, not
crash the agent. POST failures should retry with backoff rather than
silently dropping readings.

## API Endpoints (planned)

| Method | Path                                     | Purpose                                                                            |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/metrics`                               | Create a metric in the catalog                                                     |
| GET    | `/metrics`                               | List catalog metrics                                                               |
| POST   | `/templates`                             | Create a metric template                                                           |
| POST   | `/templates/:id/metrics`                 | Add a metric + default policy to a template                                        |
| POST   | `/targets`                               | Create a target, generates API key                                                 |
| POST   | `/targets/:id/templates`                 | Assign a template to a target                                                      |
| DELETE | `/targets/:id/templates/:templateId`     | Unassign a template                                                                |
| POST   | `/targets/:id/overrides`                 | Set/update a per-metric override (validates metric is inherited)                   |
| GET    | `/targets/:id/metrics`                   | **Agent-facing.** Effective flat metric list (key + interval only)                 |
| POST   | `/targets/:id/metrics`                   | **Agent-facing.** Submit a reading; triggers policy resolution + breach evaluation |
| GET    | `/targets/:id/metrics/:metricId/history` | Time-series data for charting                                                      |
| GET    | `/alerts`                                | List alerts (filter by status/team/priority)                                       |
| POST   | `/alerts/:id/first-response`             | Record acknowledgment (who, when, note)                                            |
| POST   | `/alerts/:id/resolve`                    | Manually resolve an alert                                                          |

## Open Design Notes / Future Extensions

- Tie-break rule when two assigned templates define the same metric with
  different defaults: deterministic (e.g. lowest `template_metrics.id`) —
  acceptable since overrides exist to resolve any case where it matters.
- MTTA (first response − opened) and MTTR (resolved − opened) are both
  computable from existing `alerts` columns — worth surfacing on the UI as a
  small ops-metrics dashboard later.
- Alert subject/description support simple templating (e.g.
  `"High {{metric}} on {{target}}"`), rendered into a static string at
  alert-creation time and stored in `alerts.subject`/`description`.
