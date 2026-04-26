-- Outbox pattern for ClickHouse dual-write reliability
-- If CH is temporarily unavailable, rows are queued here and retried by a background worker.

CREATE TABLE IF NOT EXISTS ch_outbox (
  id            SERIAL PRIMARY KEY,
  table_name    TEXT NOT NULL,
  payload_json  JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  retry_count   INTEGER DEFAULT 0,
  last_error    TEXT,
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ch_outbox_unprocessed
  ON ch_outbox (created_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ch_outbox_table
  ON ch_outbox (table_name, created_at)
  WHERE processed_at IS NULL;
