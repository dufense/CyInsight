-- Performance: add functional index on LOWER(hostname) to speed up Cynet host
-- lookups that use inArray(sql`LOWER(${assets.hostname})`, ...). The existing
-- idx_assets_tenant_hostname is on the raw column and cannot be used for
-- functional expressions, causing sequential scans that exceed the 30s timeout
-- for tenants with many endpoints.
--
-- CONCURRENTLY avoids locking the table during creation.
CREATE INDEX IF NOT EXISTS idx_assets_tenant_lower_hostname
  ON assets (tenant_id, LOWER(hostname))
  WHERE hostname IS NOT NULL AND hostname != '';
