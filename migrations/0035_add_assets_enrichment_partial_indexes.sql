-- P0 Hotfix: Partial indexes for asset enrichment startup query
-- These indexes eliminate the 19.7-second COUNT(*) scan that exhausts the connection pool
-- Note: CREATE INDEX CONCURRENTLY cannot run inside drizzle's transaction wrapper,
-- so we use regular CREATE INDEX IF NOT EXISTS. The assets table is small enough
-- that the brief lock is acceptable (< 1 second).

CREATE INDEX IF NOT EXISTS idx_assets_needs_enrich_source
  ON assets(tenant_id) WHERE source = 'import';

CREATE INDEX IF NOT EXISTS idx_assets_needs_enrich_sw_null
  ON assets(tenant_id) WHERE software_inventory IS NULL;

CREATE INDEX IF NOT EXISTS idx_assets_needs_enrich_sw_empty
  ON assets(tenant_id) WHERE software_inventory = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_assets_needs_enrich_user_num
  ON assets(tenant_id) WHERE user_name ~ '^[0-9]+$';
