import { pool } from "./db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import fs from "fs";
import path from "path";

export async function runMigrations() {
  console.log("Running database migrations...");

  const client = await pool.connect();
  try {
    const journalExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      );
    `);

    const tenantsExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenants'
      );
    `);

    if (tenantsExist.rows[0].exists && !journalExists.rows[0].exists) {
      console.log("Existing database detected without migration journal. Creating baseline...");
      await client.query(`
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
      `);

      const metaPath = path.resolve("./migrations/meta/_journal.json");
      const journal = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

      if (journal.entries && journal.entries.length > 0) {
        const firstEntry = journal.entries[0];
        const migrationHash = firstEntry.tag;

        const alreadyApplied = await client.query(
          `SELECT id FROM "__drizzle_migrations" WHERE hash = $1`,
          [migrationHash]
        );

        if (alreadyApplied.rows.length === 0) {
          await client.query(
            `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
            [migrationHash, Date.now()]
          );
          console.log(`Baseline migration "${migrationHash}" marked as applied (tables already exist).`);
        }
      }
    }
  } finally {
    client.release();
  }

  // ── Idempotent column additions (run on every startup, safe to repeat) ──────
  {
    const client3 = await pool.connect();
    try {
      // Add malware_family column to threat_intel_iocs if not present (Task #133)
      await client3.query(`
        ALTER TABLE threat_intel_iocs ADD COLUMN IF NOT EXISTS malware_family VARCHAR(255);
      `);

      // ── Platform Integrations table (#135) ─────────────────────────────────
      await client3.query(`
        CREATE TABLE IF NOT EXISTS platform_integrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          display_name VARCHAR(100) NOT NULL,
          category VARCHAR(50) NOT NULL DEFAULT 'threat_intel',
          description TEXT,
          enabled BOOLEAN NOT NULL DEFAULT true,
          requires_key BOOLEAN NOT NULL DEFAULT false,
          api_key TEXT,
          last_tested_at TIMESTAMP,
          test_status VARCHAR(20) DEFAULT 'untested',
          test_message TEXT,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      // Column guards — idempotent for upgraded environments where table may
      // already exist but was created by an older schema without certain columns.
      await client3.query(`
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NOT NULL DEFAULT '';
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'threat_intel';
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS requires_key BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS api_key TEXT;
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP;
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS test_status VARCHAR(20) DEFAULT 'untested';
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS test_message TEXT;
        ALTER TABLE platform_integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
      `);

      // Seed the 5 default threat-feed integrations (idempotent via ON CONFLICT)
      await client3.query(`
        INSERT INTO platform_integrations
          (name, display_name, category, description, enabled, requires_key)
        VALUES
          ('malwarebazaar',  'MalwareBazaar',    'threat_intel',
           'Abuse.ch hash-based malware intelligence feed. Identifies known-malicious file hashes with malware family and tag data. No API key required.',
           true, false),
          ('urlhaus',        'URLhaus',           'threat_intel',
           'Abuse.ch URL/domain threat feed. Flags malicious URLs and domains used for malware distribution. No API key required.',
           true, false),
          ('feodo_tracker',  'Feodo Tracker',     'threat_intel',
           'Abuse.ch C2 botnet IP blocklist. Identifies IPs hosting botnet command-and-control infrastructure. No API key required.',
           true, false),
          ('alienvault_otx', 'AlienVault OTX',    'threat_intel',
           'AlienVault Open Threat Exchange. Broad threat intelligence covering hashes, IPs, domains, and URLs across thousands of community-contributed pulses. Requires a free OTX API key.',
           true, true),
          ('virustotal',     'VirusTotal',        'threat_intel',
           'VirusTotal Community API. Aggregates results from 70+ antivirus engines for hash, IP, domain, and URL reputation. Requires a free VirusTotal API key.',
           true, true),
          ('threatfox',      'ThreatFox',         'threat_intel',
           'Abuse.ch ThreatFox feed. Shares IOCs (IPs, domains, URLs, hashes) associated with malware command-and-control infrastructure. No API key required.',
           true, false),
          ('greynoise',      'GreyNoise',          'threat_intel',
           'GreyNoise Internet noise intelligence. Distinguishes benign internet scanners from targeted attacks for IPs. Requires a GreyNoise Community API key.',
           true, true),
          ('shodan',         'Shodan',             'threat_intel',
           'Shodan internet-facing asset search engine. Provides port, banner, and vulnerability data for IP reputation enrichment. Requires a Shodan API key.',
           true, true),
          ('urlscan_io',     'URLScan.io',         'threat_intel',
           'URLScan.io public URL scanner. Detects malicious and phishing URLs, provides DOM capture, screenshot, and linked IOCs. Requires a free URLScan.io API key.',
           true, true),
          ('anyrun',         'Any.Run',            'malware_sandbox',
           'Interactive cloud-based malware sandbox. Supports live analysis sessions, behavioral reports, and hash-based lookups. Requires an Any.Run API key.',
           false, true),
          ('hybrid_analysis','Hybrid Analysis',    'malware_sandbox',
           'CrowdStrike Falcon Sandbox (Hybrid Analysis). Provides behavioral and hybrid detonation reports with MITRE ATT&CK mapping. Requires a free API key.',
           false, true),
          ('joe_sandbox',    'Joe Sandbox',        'malware_sandbox',
           'Joe Security AI-powered sandbox with deep behavioral analysis, code analysis, and network detection. Requires a Joe Sandbox Cloud API key.',
           false, true),
          ('hatching_triage','Hatching Triage',    'malware_sandbox',
           'Hatching Triage high-throughput malware sandbox with YARA, Suricata, and behavioral classification. Requires a Triage API key.',
           false, true),
          ('intezer_analyze','Intezer Analyze',    'malware_sandbox',
           'Intezer genetic malware analysis platform. Identifies code reuse, malware families, and threat actors via gene-based classification. Requires an Intezer API key.',
           false, true),
          ('vmray',          'VMRay',              'malware_sandbox',
           'VMRay agentless hypervisor-based sandbox with VTI threat scoring and evasion-resistant detonation. Requires a VMRay API key.',
           false, true)
        ON CONFLICT (name) DO NOTHING;
      `);

    } catch (err: any) {
      console.error("Platform integrations migration error (non-fatal):", err.message);
    } finally { client3.release(); }
  }

  try {
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: "./migrations" });
    console.log("Database migrations completed successfully.");
  } catch (error: any) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("Database schema is up to date.");
      const journalPath = path.resolve("./migrations/meta/_journal.json");
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
      const client2 = await pool.connect();
      try {
        for (const entry of journal.entries) {
          const applied = await client2.query(
            `SELECT id FROM "__drizzle_migrations" WHERE hash = $1`,
            [entry.tag]
          );
          if (applied.rows.length === 0) {
            await client2.query(
              `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
              [entry.tag, Date.now()]
            );
            console.log(`Marked migration "${entry.tag}" as applied.`);
          }
        }
      } finally {
        client2.release();
      }
    } else {
      console.error("Migration failed:", error.message);
      throw error;
    }
  }
}
