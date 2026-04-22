-- Performance: add partial index on assets(tenant_id, hostname) to speed up
-- connector hostname lookups and deduplication queries that currently scan the
-- full table (db.t3.medium, ~900 rows per tenant → 12s+ without index).
-- Partial: only rows with a non-empty hostname are ever matched.
-- CONCURRENTLY avoids locking the table during creation.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_tenant_hostname
  ON assets (tenant_id, hostname)
  WHERE hostname IS NOT NULL AND hostname != '';
