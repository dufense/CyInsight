-- ClickHouse Compression Verification Script
-- Run this in clickhouse-client or via HTTP API

-- [1] Check column codecs
SELECT
  name,
  type,
  compression_codec,
  CASE
    WHEN compression_codec != '' THEN '✅ explicit'
    WHEN type LIKE 'LowCardinality%' THEN 'ℹ️  LowCardinality (built-in)'
    WHEN type REGEXP '^(UInt|Int|Float|Date|IPv4)' THEN 'ℹ️  numeric (default LZ4)'
    ELSE '⚠️  NO CODEC'
  END AS codec_status
FROM system.columns
WHERE database = 'ccc' AND table = 'security_events'
ORDER BY position;

-- [2] Overall compression ratio
SELECT
  formatReadableSize(sum(data_compressed_bytes)) AS compressed,
  formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
  round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS ratio
FROM system.parts_columns
WHERE database = 'ccc' AND table = 'security_events' AND active = 1;

-- [3] Per-column compression
SELECT
  column,
  formatReadableSize(sum(data_compressed_bytes)) AS compressed,
  formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
  round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS ratio
FROM system.parts_columns
WHERE database = 'ccc' AND table = 'security_events' AND active = 1
GROUP BY column
ORDER BY sum(data_uncompressed_bytes) DESC;

-- [4] Data distribution across disks
SELECT
  disk_name,
  count() AS parts,
  formatReadableSize(sum(bytes_on_disk)) AS compressed_size,
  formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size,
  round(sum(data_uncompressed_bytes) / sum(bytes_on_disk), 2) AS ratio
FROM system.parts
WHERE database = 'ccc' AND table = 'security_events' AND active = 1
GROUP BY disk_name
ORDER BY disk_name;

-- [5] S3 disk configuration
SELECT name, type, path FROM system.disks WHERE name LIKE 's3%';

-- [6] Storage policy
SELECT policy_name, volume_name, groupArray(disk_name) AS disks
FROM system.storage_policies
WHERE policy_name = 'ccc_tiered'
GROUP BY policy_name, volume_name;

-- [7] Table storage policy
SELECT name, storage_policy FROM system.tables
WHERE database = 'ccc' AND name = 'security_events';
