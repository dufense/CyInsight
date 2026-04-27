-- ClickHouse Post-Deployment SQL
-- Run these commands after the CloudFormation update and ClickHouse restart

-- [1] Verify S3 disk is recognized
SELECT name, type, path FROM system.disks;

-- [2] Verify storage policy exists
SELECT * FROM system.storage_policies WHERE policy_name = 'ccc_tiered';

-- [3] Apply storage policy to existing table (idempotent)
ALTER TABLE ccc.security_events MODIFY SETTING storage_policy = 'ccc_tiered';

-- [4] Verify table now uses the policy
SELECT name, storage_policy FROM system.tables WHERE database = 'ccc' AND name = 'security_events';

-- [5] Force TTL move for old data parts (optional — TTL runs automatically every few hours)
-- OPTIMIZE TABLE ccc.security_events FINAL;

-- [6] Check which parts are eligible for TTL move
SELECT
  partition,
  name,
  disk_name,
  formatReadableSize(bytes_on_disk) AS size,
  formatDateTime(min_date, '%Y-%m-%d') AS min_date,
  formatDateTime(max_date, '%Y-%m-%d') AS max_date,
  delete_ttl_info_min
FROM system.parts
WHERE database = 'ccc' AND table = 'security_events' AND active = 1
ORDER BY partition DESC
LIMIT 20;
