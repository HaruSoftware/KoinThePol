-- KoinThePol database schema for Neon/PostgreSQL

CREATE TABLE IF NOT EXISTS market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  duration_hours INTEGER NOT NULL CHECK (duration_hours IN (1, 4)),
  up_probability NUMERIC(8, 6),
  down_probability NUMERIC(8, 6),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', NOW()),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS market_snapshots_market_observed_idx
  ON market_snapshots (market_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS market_snapshots_duration_observed_idx
  ON market_snapshots (duration_hours, observed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS market_snapshots_one_per_minute_idx
  ON market_snapshots (market_id, duration_hours, observed_at);

CREATE TABLE IF NOT EXISTS predictions (
  id BIGSERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('UP', 'DOWN', 'UNKNOWN')),
  confidence NUMERIC(8, 6) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_id BIGINT REFERENCES market_snapshots(id)
);

CREATE INDEX IF NOT EXISTS predictions_market_generated_idx
  ON predictions (market_id, generated_at DESC);
