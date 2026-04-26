/**
 * ClickHouse Outbox Worker
 *
 * Processes the ch_outbox table and writes rows to ClickHouse.
 * This ensures ClickHouse never misses data even during temporary outages.
 */

import { pool } from "./db";

let workerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

interface OutboxRow {
  id: number;
  table_name: string;
  payload_json: any;
  retry_count: number;
}

async function pollOutbox(): Promise<void> {
  const client = await pool.connect();
  try {
    // Fetch up to 100 unprocessed rows, oldest first
    const { rows } = await client.query<OutboxRow>(
      `SELECT id, table_name, payload_json, retry_count
       FROM ch_outbox
       WHERE processed_at IS NULL
       ORDER BY created_at ASC
       LIMIT 100`
    );

    if (rows.length === 0) return;

    const m = await import("./clickhouse-client");
    const chClient = m.getClickHouseClient();
    if (!chClient) {
      console.log("[CH Outbox] ClickHouse not available, skipping batch");
      return;
    }

    for (const row of rows) {
      try {
        const payload = Array.isArray(row.payload_json) ? row.payload_json : [row.payload_json];

        if (row.table_name === "security_events") {
          await chClient.insertEvents(payload);
        } else if (row.table_name === "incidents") {
          await chClient.insertIncidents(payload);
        } else {
          console.warn(`[CH Outbox] Unknown table_name: ${row.table_name}`);
        }

        // Mark as processed
        await client.query(
          `UPDATE ch_outbox SET processed_at = NOW() WHERE id = $1`,
          [row.id]
        );
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        const newRetryCount = row.retry_count + 1;

        if (newRetryCount >= 10) {
          // Dead letter — mark as processed so we don't retry forever
          console.error(`[CH Outbox] Row ${row.id} exceeded max retries, dead-lettering: ${msg.slice(0, 200)}`);
          await client.query(
            `UPDATE ch_outbox SET processed_at = NOW(), retry_count = $1, last_error = $2 WHERE id = $3`,
            [newRetryCount, msg.slice(0, 500), row.id]
          );
        } else {
          await client.query(
            `UPDATE ch_outbox SET retry_count = $1, last_error = $2 WHERE id = $3`,
            [newRetryCount, msg.slice(0, 500), row.id]
          );
        }
      }
    }
  } finally {
    client.release();
  }
}

export function startChOutboxWorker(pollIntervalMs = 5_000): void {
  if (workerRunning) return;
  workerRunning = true;
  console.log("[CH Outbox] Starting outbox worker");

  workerInterval = setInterval(() => {
    pollOutbox().catch((err: any) => {
      console.error("[CH Outbox] Worker error:", err instanceof Error ? err.message : String(err));
    });
  }, pollIntervalMs);
}

export function stopChOutboxWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  workerRunning = false;
}
