-- Missing indexes for frequently queried columns
-- Created: 2026-04-26

CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to
  ON incidents (assigned_to) WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to_status
  ON tickets (assigned_to, status) WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_security_events_batch_id
  ON security_events (batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_last_seen
  ON assets (last_seen) WHERE last_seen IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_dedup_hash_tenant
  ON incidents (tenant_id, dedup_hash) WHERE dedup_hash IS NOT NULL;
