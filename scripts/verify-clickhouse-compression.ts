#!/usr/bin/env tsx
/**
 * Verify ClickHouse compression is enforced and measure compression ratios.
 *
 * Run this script from the app container or locally with CH access:
 *   npx tsx scripts/verify-clickhouse-compression.ts [CLICKHOUSE_URL] [PASSWORD]
 *
 * Example:
 *   npx tsx scripts/verify-clickhouse-compression.ts http://localhost:8123 default_password
 */

import { ClickHouseClient } from "../server/clickhouse-client";

const url = process.argv[2] || process.env.CLICKHOUSE_URL || "http://localhost:8123";
const password = process.argv[3] || process.env.CLICKHOUSE_PASSWORD || "";

async function main() {
  const client = new ClickHouseClient({ url, password, database: "ccc" });

  console.log("=== ClickHouse Compression Verification ===\n");

  // 1. Check table DDL for CODEC declarations
  console.log("[1] Checking table schema for CODEC declarations...");
  const columns = await client.queryRows<{
    name: string;
    type: string;
    compression_codec: string;
  }>(`
    SELECT name, type, compression_codec
    FROM system.columns
    WHERE database = 'ccc' AND table = 'security_events'
    ORDER BY position
  `);

  let missingCodec = 0;
  for (const col of columns) {
    const hasCodec = col.compression_codec && col.compression_codec !== '';
    const isLowCardinality = col.type.includes('LowCardinality');
    const isNumeric = /^(UInt|Int|Float|Date|IPv4)/.test(col.type);

    if (!hasCodec && !isLowCardinality && !isNumeric) {
      console.log(`  ⚠️  ${col.name}: ${col.type} — NO CODEC (should have ZSTD)`);
      missingCodec++;
    } else if (hasCodec) {
      console.log(`  ✅ ${col.name}: ${col.type} — CODEC: ${col.compression_codec}`);
    } else {
      console.log(`  ℹ️  ${col.name}: ${col.type} — default codec (LowCardinality/numeric)`);
    }
  }

  if (missingCodec > 0) {
    console.log(`\n  ⚠️  ${missingCodec} column(s) missing explicit CODEC.`);
    console.log(`     Run: ALTER TABLE ccc.security_events MODIFY COLUMN <col> <type> CODEC(ZSTD(3))`);
  } else {
    console.log(`\n  ✅ All columns have appropriate compression.`);
  }

  // 2. Check compression ratio per column
  console.log("\n[2] Measuring compression ratios per column...");
  const compressionStats = await client.queryRows<{
    column: string;
    compressed: string;
    uncompressed: string;
    ratio: number;
  }>(`
    SELECT
      column AS column,
      formatReadableSize(sum(data_compressed_bytes)) AS compressed,
      formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
      round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS ratio
    FROM system.parts_columns
    WHERE database = 'ccc' AND table = 'security_events' AND active = 1
    GROUP BY column
    ORDER BY sum(data_uncompressed_bytes) DESC
  `);

  console.log(`  ${'Column'.padEnd(20)} ${'Compressed'.padEnd(14)} ${'Uncompressed'.padEnd(14)} ${'Ratio'.padEnd(8)}`);
  console.log(`  ${'─'.repeat(60)}`);
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (const row of compressionStats) {
    console.log(`  ${row.column.padEnd(20)} ${row.compressed.padEnd(14)} ${row.uncompressed.padEnd(14)} ${String(row.ratio).padEnd(8)}x`);
    // Parse readable size back to bytes for total (approximate)
    totalCompressed += parseReadableSize(row.compressed);
    totalUncompressed += parseReadableSize(row.uncompressed);
  }

  if (compressionStats.length > 0) {
    const overallRatio = totalUncompressed / totalCompressed;
    console.log(`  ${'─'.repeat(60)}`);
    console.log(`  ${'OVERALL'.padEnd(20)} ${formatBytes(totalCompressed).padEnd(14)} ${formatBytes(totalUncompressed).padEnd(14)} ${overallRatio.toFixed(2).padEnd(8)}x`);
  }

  // 3. Check data distribution across disks (hot vs warm)
  console.log("\n[3] Checking data distribution across disks (hot vs warm)...");
  const diskStats = await client.queryRows<{
    disk_name: string;
    parts: number;
    compressed_size: string;
    uncompressed_size: string;
  }>(`
    SELECT
      disk_name,
      count() AS parts,
      formatReadableSize(sum(bytes_on_disk)) AS compressed_size,
      formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size
    FROM system.parts
    WHERE database = 'ccc' AND table = 'security_events' AND active = 1
    GROUP BY disk_name
    ORDER BY disk_name
  `);

  if (diskStats.length === 0) {
    console.log("  ⚠️  No data found in security_events table.");
  } else {
    for (const row of diskStats) {
      console.log(`  ${row.disk_name}: ${row.parts} parts, ${row.compressed_size} compressed, ${row.uncompressed_size} uncompressed`);
    }
  }

  // 4. Verify S3 disk is configured
  console.log("\n[4] Verifying S3 disk configuration...");
  const disks = await client.queryRows<{
    name: string;
    type: string;
    path: string;
  }>(`
    SELECT name, type, path
    FROM system.disks
    WHERE name LIKE 's3%'
  `);

  if (disks.length === 0) {
    console.log("  ❌ No S3 disks configured. Check storage.xml.");
  } else {
    for (const disk of disks) {
      console.log(`  ✅ ${disk.name}: type=${disk.type}, path=${disk.path}`);
    }
  }

  // 5. Verify storage policy
  console.log("\n[5] Verifying storage policy...");
  const policies = await client.queryRows<{
    policy_name: string;
    volume_name: string;
    disks: string;
  }>(`
    SELECT policy_name, volume_name, groupArray(disk_name) AS disks
    FROM system.storage_policies
    WHERE policy_name = 'ccc_tiered'
    GROUP BY policy_name, volume_name
  `);

  if (policies.length === 0) {
    console.log("  ❌ ccc_tiered policy not found. Check storage.xml.");
  } else {
    for (const p of policies) {
      console.log(`  ✅ ${p.policy_name} → ${p.volume_name}: ${p.disks}`);
    }
  }

  // 6. Verify table uses the correct storage policy
  console.log("\n[6] Verifying table storage policy...");
  const tablePolicy = await client.queryRows<{
    name: string;
    storage_policy: string;
  }>(`
    SELECT name, storage_policy
    FROM system.tables
    WHERE database = 'ccc' AND name = 'security_events'
  `);

  if (tablePolicy.length === 0) {
    console.log("  ❌ security_events table not found.");
  } else if (tablePolicy[0].storage_policy !== 'ccc_tiered') {
    console.log(`  ⚠️  Table uses policy '${tablePolicy[0].storage_policy}', expected 'ccc_tiered'.`);
    console.log(`     Run: ALTER TABLE ccc.security_events MODIFY SETTING storage_policy = 'ccc_tiered'`);
  } else {
    console.log(`  ✅ Table uses 'ccc_tiered' policy.`);
  }

  console.log("\n=== Verification Complete ===");
}

function parseReadableSize(size: string): number {
  const match = size.match(/([\d.]+)\s*(B|KiB|MiB|GiB|TiB)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { B: 1, KiB: 1024, MiB: 1024**2, GiB: 1024**3, TiB: 1024**4 };
  return val * (multipliers[unit] || 1);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
