-- Performance: add functional indexes for startup asset cleanup queries.
-- The deduplication DELETEs in runStartupAssetCleanup() use LOWER(TRIM(hostname)),
-- TRIM(ip_address), and LOWER(TRIM(operating_system)) which cannot use the plain
-- column indexes, causing sequential scans that timeout after 30s on large tables.
--
-- CONCURRENTLY avoids locking the table during creation.

CREATE INDEX IF NOT EXISTS idx_assets_tenant_lower_trim_hostname
  ON assets (tenant_id, LOWER(TRIM(hostname)))
  WHERE hostname IS NOT NULL AND TRIM(hostname) != '' AND LENGTH(TRIM(hostname)) >= 2;

CREATE INDEX IF NOT EXISTS idx_assets_tenant_trim_ip
  ON assets (tenant_id, TRIM(ip_address))
  WHERE ip_address IS NOT NULL AND TRIM(ip_address) != '' AND TRIM(ip_address) != '0.0.0.0';

CREATE INDEX IF NOT EXISTS idx_assets_tenant_lower_trim_os
  ON assets (tenant_id, LOWER(TRIM(operating_system)))
  WHERE operating_system IS NOT NULL AND TRIM(operating_system) != '';
