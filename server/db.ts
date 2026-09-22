import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg
export const pool = new Pool({ connectionString: config.databaseUrl })

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id BIGSERIAL PRIMARY KEY,
      market_id TEXT NOT NULL,
      slug TEXT,
      duration_hours INTEGER NOT NULL,
      up_probability NUMERIC(8, 6),
      down_probability NUMERIC(8, 6),
      observed_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', NOW()),
      payload JSONB NOT NULL
    );

    ALTER TABLE market_snapshots
      ADD COLUMN IF NOT EXISTS duration_hours INTEGER;

    ALTER TABLE market_snapshots
      ADD COLUMN IF NOT EXISTS slug TEXT;

    UPDATE market_snapshots
      SET slug = COALESCE(payload->>'slug', payload->'market'->>'slug')
      WHERE slug IS NULL AND COALESCE(payload->>'slug', payload->'market'->>'slug') IS NOT NULL;

    UPDATE market_snapshots
      SET duration_hours = 1
      WHERE duration_hours IS NULL;

    ALTER TABLE market_snapshots
      ALTER COLUMN duration_hours SET NOT NULL;

    ALTER TABLE market_snapshots
      DROP COLUMN IF EXISTS question;

    ALTER TABLE market_snapshots
      ALTER COLUMN observed_at SET DEFAULT date_trunc('minute', NOW());

    UPDATE market_snapshots
      SET observed_at = date_trunc('minute', observed_at);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'market_snapshots_duration_hours_check'
      ) THEN
        ALTER TABLE market_snapshots
          ADD CONSTRAINT market_snapshots_duration_hours_check
          CHECK (duration_hours IN (1, 4));
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS market_snapshots_market_observed_idx
      ON market_snapshots (market_id, observed_at DESC);

    DELETE FROM market_snapshots first_snapshot
      USING market_snapshots duplicate_snapshot
      WHERE first_snapshot.id > duplicate_snapshot.id
        AND first_snapshot.market_id = duplicate_snapshot.market_id
        AND first_snapshot.duration_hours = duplicate_snapshot.duration_hours
        AND first_snapshot.observed_at = date_trunc('minute', duplicate_snapshot.observed_at);

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
  `)
}

export async function insertMarketSnapshot(
  marketId: string,
  slug: string,
  durationHours: 1 | 4,
  upProbability: number,
  downProbability: number,
  payload: unknown,
): Promise<{ id: string; observed_at: string; created: boolean }> {
  const inserted = await pool.query<{ id: string; observed_at: string }>(
    `INSERT INTO market_snapshots
      (market_id, slug, duration_hours, up_probability, down_probability, payload, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, date_trunc('minute', NOW()))
     ON CONFLICT DO NOTHING
     RETURNING id, observed_at`,
    [marketId, slug, durationHours, upProbability, downProbability, payload],
  )
  if (inserted.rows[0]) return { ...inserted.rows[0], created: true }

  const existing = await pool.query<{ id: string; observed_at: string }>(
    `SELECT id, observed_at FROM market_snapshots
     WHERE market_id = $1 AND duration_hours = $2
       AND observed_at = date_trunc('minute', NOW())
     LIMIT 1`,
    [marketId, durationHours],
  )
  if (!existing.rows[0]) throw new Error('Snapshot conflict could not be resolved')
  return { ...existing.rows[0], created: false }
}