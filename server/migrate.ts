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

  // Ensure graph_nodes, graph_edges, and is_template columns exist on playbooks table (SOAR Visual Editor)
  try {
    const client4 = await pool.connect();
    try {
      await client4.query(`
        ALTER TABLE playbooks
          ADD COLUMN IF NOT EXISTS graph_nodes jsonb DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS graph_edges jsonb DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
      `);
    } finally { client4.release(); }
  } catch (err: any) {
    console.error("Playbooks graph column migration error (non-fatal):", err.message);
  }

  // ─── Add first-class parse/AI fields to security_events (#157) ──────────────
  try {
    const clientAI = await pool.connect();
    try {
      await clientAI.query(`
        ALTER TABLE security_events ADD COLUMN IF NOT EXISTS parse_confidence INTEGER;
        ALTER TABLE security_events ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
        ALTER TABLE security_events ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
        ALTER TABLE security_events ADD COLUMN IF NOT EXISTS raw_log TEXT;
        ALTER TABLE security_events ADD COLUMN IF NOT EXISTS device_fingerprint_id INTEGER;
      `);
    } finally { clientAI.release(); }
  } catch (err: any) {
    console.error("security_events AI fields migration error (non-fatal):", err.message);
  }

  // ─── Extend event_type enum with web, database, ot_iot (#157) ────────────────
  try {
    const client5a = await pool.connect();
    try {
      await client5a.query(`
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'web';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'database';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'ot_iot';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'privilege_escalation';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'lateral_movement';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'defense_evasion';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'failed_auth';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'data_exfiltration';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'ransomware';
        EXCEPTION WHEN others THEN null;
        END $$;
        DO $$ BEGIN
          ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'malware';
        EXCEPTION WHEN others THEN null;
        END $$;
      `);
    } finally { client5a.release(); }
  } catch (err: any) {
    console.error("event_type enum extension error (non-fatal):", err.message);
  }

  // ─── Universal Log Ingestion & Parsing tables (#157) ─────────────────────────
  try {
    const client5 = await pool.connect();
    try {
      await client5.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."log_source_type" AS ENUM(
            'firewall','ids_ips','waf','proxy','edr','email_gateway',
            'database_monitor','casb','cloud','ot_iot','network_tap',
            'siem','identity','vulnerability_scanner','custom'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          CREATE TYPE "public"."log_source_protocol" AS ENUM(
            'syslog_udp','syslog_tcp','syslog_tls','http_webhook','cef','leef',
            'json','xml','plaintext','file_upload','api_pull'
          );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;

        CREATE TABLE IF NOT EXISTS log_sources (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          source_type log_source_type DEFAULT 'custom' NOT NULL,
          protocol log_source_protocol DEFAULT 'json' NOT NULL,
          host VARCHAR(255),
          port INTEGER,
          expected_format VARCHAR(100),
          tags TEXT[] DEFAULT '{}',
          fingerprint_id INTEGER,
          is_active BOOLEAN DEFAULT true NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS device_fingerprints (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          source_identifier VARCHAR(255) NOT NULL,
          vendor VARCHAR(200),
          product VARCHAR(200),
          log_format VARCHAR(100),
          event_category VARCHAR(100),
          detected_fields JSONB DEFAULT '[]',
          sample_log_lines TEXT[] DEFAULT '{}',
          ai_confidence INTEGER DEFAULT 0,
          ai_reasoning TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_health (
          id SERIAL PRIMARY KEY,
          source_id INTEGER NOT NULL REFERENCES log_sources(id) ON DELETE CASCADE,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          events_per_min REAL DEFAULT 0,
          parse_success_rate REAL DEFAULT 100,
          last_seen TIMESTAMP,
          error_rate REAL DEFAULT 0,
          total_events_today INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );

        CREATE INDEX IF NOT EXISTS log_sources_tenant_id_idx ON log_sources(tenant_id);
        CREATE INDEX IF NOT EXISTS device_fingerprints_tenant_source_idx ON device_fingerprints(tenant_id, source_identifier);
        CREATE INDEX IF NOT EXISTS source_health_source_id_idx ON source_health(source_id);
        CREATE INDEX IF NOT EXISTS source_health_tenant_id_idx ON source_health(tenant_id);
      `);
    } finally { client5.release(); }
  } catch (err: any) {
    console.error("Log ingestion tables migration error (non-fatal):", err.message);
  }

  // ── Multi-Vector Attack Detection Engine tables (Task #158) ──────────────────
  try {
    const clientAttack = await pool.connect();
    try {
      await clientAttack.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detection_feedback_type') THEN
            CREATE TYPE detection_feedback_type AS ENUM ('true_positive', 'false_positive', 'benign');
          END IF;
        END $$;
      `);

      await clientAttack.query(`
        CREATE TABLE IF NOT EXISTS attack_detections (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          event_id INTEGER REFERENCES security_events(id) ON DELETE SET NULL,
          incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
          attack_category VARCHAR(100) NOT NULL,
          sub_type VARCHAR(200),
          confidence INTEGER NOT NULL DEFAULT 0,
          severity VARCHAR(20) NOT NULL DEFAULT 'medium',
          mitre_attack_id VARCHAR(50),
          mitre_attack_ids TEXT[] DEFAULT '{}',
          kill_chain_phase VARCHAR(100),
          explanation TEXT,
          entities JSONB DEFAULT '{"ips":[],"users":[],"hosts":[],"hashes":[],"domains":[]}',
          signal_score INTEGER DEFAULT 0,
          signals JSONB DEFAULT '[]',
          behavioral_deviation_score INTEGER DEFAULT 0,
          attack_chain_id VARCHAR(100),
          raw_context JSONB,
          detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS attack_detections_tenant_idx ON attack_detections(tenant_id);
        CREATE INDEX IF NOT EXISTS attack_detections_event_idx ON attack_detections(event_id);
        CREATE INDEX IF NOT EXISTS attack_detections_chain_idx ON attack_detections(attack_chain_id);
        CREATE INDEX IF NOT EXISTS attack_detections_category_idx ON attack_detections(attack_category);
        CREATE INDEX IF NOT EXISTS attack_detections_detected_at_idx ON attack_detections(detected_at DESC);
      `);

      await clientAttack.query(`
        CREATE TABLE IF NOT EXISTS attack_chain_groups (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          chain_id VARCHAR(100) NOT NULL UNIQUE,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          attack_categories TEXT[] DEFAULT '{}',
          kill_chain_phases TEXT[] DEFAULT '{}',
          shared_entities JSONB DEFAULT '{"ips":[],"users":[],"hosts":[],"hashes":[]}',
          event_ids INTEGER[] DEFAULT '{}',
          detection_ids INTEGER[] DEFAULT '{}',
          incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
          overall_confidence INTEGER DEFAULT 0,
          severity VARCHAR(20) DEFAULT 'medium',
          time_window_minutes INTEGER DEFAULT 60,
          promoted_to_incident BOOLEAN DEFAULT false,
          first_event_at TIMESTAMP,
          last_event_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS attack_chain_groups_tenant_idx ON attack_chain_groups(tenant_id);
        CREATE INDEX IF NOT EXISTS attack_chain_groups_updated_idx ON attack_chain_groups(updated_at DESC);
      `);

      await clientAttack.query(`
        CREATE TABLE IF NOT EXISTS detection_feedback (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          detection_id INTEGER REFERENCES attack_detections(id) ON DELETE SET NULL,
          incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
          analyst_user_id VARCHAR(255) NOT NULL,
          feedback_type detection_feedback_type NOT NULL,
          attack_category VARCHAR(100),
          original_confidence INTEGER,
          notes TEXT,
          used_for_training BOOLEAN DEFAULT false,
          training_weight REAL DEFAULT 1.0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS detection_feedback_tenant_idx ON detection_feedback(tenant_id);
        CREATE INDEX IF NOT EXISTS detection_feedback_detection_idx ON detection_feedback(detection_id);
      `);

      await clientAttack.query(`
        CREATE TABLE IF NOT EXISTS category_confidence_thresholds (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          attack_category VARCHAR(100) NOT NULL,
          min_confidence_threshold INTEGER DEFAULT 40,
          tp_count INTEGER DEFAULT 0,
          fp_count INTEGER DEFAULT 0,
          benign_count INTEGER DEFAULT 0,
          few_shot_examples JSONB DEFAULT '[]',
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(tenant_id, attack_category)
        );
        CREATE INDEX IF NOT EXISTS category_thresholds_tenant_idx ON category_confidence_thresholds(tenant_id);
      `);

      console.log("[Migration] Attack detection engine tables created/verified (Task #158)");
    } catch (e: any) {
      console.error("[Migration] Attack detection tables error (non-fatal):", e.message);
    } finally {
      clientAttack.release();
    }
  } catch (e: any) {
    console.error("[Migration] Attack detection pool connection error:", e.message);
  }

  // ── Integration Autoheal (Task #159) ─────────────────────────────────────
  try {
    const clientHeal = await pool.connect();
    try {
      await clientHeal.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'heal_failure_type') THEN
            CREATE TYPE heal_failure_type AS ENUM (
              'auth_failure', 'endpoint_changed', 'rate_limited', 'schema_changed',
              'connectivity', 'api_version', 'ssl_error', 'unknown'
            );
          END IF;
        END $$;

        ALTER TABLE security_integrations
          ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS auto_heal_enabled BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS last_heal_attempt_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS last_heal_status VARCHAR(50),
          ADD COLUMN IF NOT EXISTS last_heal_message TEXT;

        CREATE TABLE IF NOT EXISTS integration_heal_logs (
          id SERIAL PRIMARY KEY,
          integration_id INTEGER NOT NULL REFERENCES security_integrations(id) ON DELETE CASCADE,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id),
          platform_key VARCHAR(100) NOT NULL,
          platform_name VARCHAR(200) NOT NULL,
          failure_type heal_failure_type NOT NULL,
          error_message TEXT,
          heal_strategy VARCHAR(200),
          config_patch JSONB,
          succeeded BOOLEAN NOT NULL,
          result_message TEXT,
          ai_diagnosis TEXT,
          consecutive_failures_at_attempt INTEGER DEFAULT 0,
          attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS heal_logs_integration_idx ON integration_heal_logs(integration_id);
        CREATE INDEX IF NOT EXISTS heal_logs_tenant_idx ON integration_heal_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS heal_logs_attempted_idx ON integration_heal_logs(attempted_at DESC);
      `);
      console.log("[Migration] Integration autoheal tables created/verified (Task #159)");
    } catch (e: any) {
      console.error("[Migration] Autoheal tables error (non-fatal):", e.message);
    } finally {
      clientHeal.release();
    }
  } catch (e: any) {
    console.error("[Migration] Autoheal pool connection error:", e.message);
  }

  // ── platform_integrations.extra_config column (Task #168) ────────────────────
  // Required by TAXII client and OpenCTI connector to store URL, pollInterval,
  // lastSyncedAt and other per-integration configuration that doesn't belong in
  // api_key. Column is idempotent (IF NOT EXISTS).
  try {
    const clientPi = await pool.connect();
    try {
      await clientPi.query(`
        ALTER TABLE platform_integrations
          ADD COLUMN IF NOT EXISTS extra_config jsonb;
      `);
      console.log("[Migration] platform_integrations.extra_config column ensured (Task #168)");
    } catch (e: any) {
      console.error("[Migration] extra_config column error (non-fatal):", e.message);
    } finally {
      clientPi.release();
    }
  } catch (e: any) {
    console.error("[Migration] extra_config pool connection error:", e.message);
  }

  // ── Performance indexes on assets table (Task #169) ─────────────────────────
  try {
    const clientIdx = await pool.connect();
    try {
      await clientIdx.query(`
        CREATE INDEX IF NOT EXISTS idx_assets_tenant_source
          ON assets(tenant_id, source);
        CREATE INDEX IF NOT EXISTS idx_assets_tenant_status
          ON assets(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_assets_tenant_endpoint_type
          ON assets(tenant_id, endpoint_type);
      `);
      console.log("[Migration] assets performance indexes ensured (Task #169)");
      try {
        // Canonical schema for migration_markers (key, completed_at, metadata)
        await clientIdx.query(`
          CREATE TABLE IF NOT EXISTS migration_markers (
            key VARCHAR(120) PRIMARY KEY,
            completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
            metadata JSONB
          )
        `).catch(() => {});
        // Heal any table created with the old wrong schema (missing columns)
        await clientIdx.query(`ALTER TABLE migration_markers ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP NOT NULL DEFAULT NOW()`).catch(() => {});
        await clientIdx.query(`ALTER TABLE migration_markers ADD COLUMN IF NOT EXISTS metadata JSONB`).catch(() => {});
        const vacuumMarker = await clientIdx.query(
          `SELECT 1 FROM migration_markers WHERE key = 'assets_vacuum_analyze_task169' LIMIT 1`
        );
        if (vacuumMarker.rows.length === 0) {
          await clientIdx.query(`VACUUM ANALYZE assets`);
          await clientIdx.query(
            `INSERT INTO migration_markers (key, completed_at, metadata) VALUES ('assets_vacuum_analyze_task169', NOW(), NULL) ON CONFLICT DO NOTHING`
          );
          console.log("[Migration] VACUUM ANALYZE assets complete (Task #169)");
        } else {
          console.log("[Migration] VACUUM ANALYZE assets already ran — skipping.");
        }
      } catch (ve: any) {
        console.warn("[Migration] VACUUM ANALYZE non-fatal:", ve.message);
      }
    } catch (e: any) {
      console.error("[Migration] assets index error (non-fatal):", e.message);
    } finally {
      clientIdx.release();
    }
  } catch (e: any) {
    console.error("[Migration] assets index pool connection error:", e.message);
  }

  // ── Log Investigation Console tables (Task #162) ─────────────────────────────
  try {
    const clientInv = await pool.connect();
    try {
      await clientInv.query(`
        CREATE TABLE IF NOT EXISTS investigation_sessions (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          analyst_id VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          source_mode VARCHAR(20) NOT NULL DEFAULT 'live',
          query_params JSONB DEFAULT '{}',
          last_run_at TIMESTAMP,
          result_count INTEGER DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS investigation_sessions_tenant_idx ON investigation_sessions(tenant_id);
        CREATE INDEX IF NOT EXISTS investigation_sessions_analyst_idx ON investigation_sessions(analyst_id);

        CREATE TABLE IF NOT EXISTS investigation_exports (
          id SERIAL PRIMARY KEY,
          session_id INTEGER REFERENCES investigation_sessions(id) ON DELETE SET NULL,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          analyst_id VARCHAR(255) NOT NULL,
          export_name VARCHAR(255),
          row_count INTEGER DEFAULT 0,
          file_hash VARCHAR(64),
          s3_key VARCHAR(500),
          query_params JSONB DEFAULT '{}',
          exported_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS investigation_exports_tenant_idx ON investigation_exports(tenant_id);
        CREATE INDEX IF NOT EXISTS investigation_exports_session_idx ON investigation_exports(session_id);
        -- Add bundle_data column idempotently for immutable artifact storage
        ALTER TABLE investigation_exports ADD COLUMN IF NOT EXISTS bundle_data BYTEA;
      `);
      console.log("[Migration] Investigation console tables created/verified (Task #162)");
    } catch (e: any) {
      console.error("[Migration] Investigation tables error (non-fatal):", e.message);
    } finally {
      clientInv.release();
    }
  } catch (e: any) {
    console.error("[Migration] Investigation pool connection error:", e.message);
  }

  // ── One-time backfill v2: re-derive action for legacy "EPS Code N" records ──
  // Uses a CTE that exactly mirrors deriveDeviceControlAction() in cynet.ts:
  //   - Priority 1: device context (deviceType OR deviceName) → specific label
  //     with full Blocked/Allowed/Detected state + all device-type branches
  //   - Priority 2: epsRemediationCode 0–40 map
  // Also corrects any generic labels left by v1 (e.g. 'Device Blocked' that
  // could be more specific when deviceName context is available).
  {
    const clientBf = await pool.connect();
    try {
      await clientBf.query(`
        CREATE TABLE IF NOT EXISTS migration_markers (
          key VARCHAR(120) PRIMARY KEY,
          completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          metadata JSONB
        );
      `).catch(() => {});

      const markerV2 = await clientBf.query(
        `SELECT 1 FROM migration_markers WHERE key = 'eps_action_backfill_v2' LIMIT 1`
      ).catch(() => ({ rows: [] }));

      if (markerV2.rows.length === 0) {
        // CTE computes the replacement action for each candidate event, mirroring
        // the normaliser logic exactly (state = Blocked/Allowed/Detected,
        // prefix = device-type classification from deviceType then deviceName).
        const updated = await clientBf.query(`
          WITH meta AS (
            SELECT
              id,
              raw_payload->'rawPayload'->'_cynetMeta' AS m,
              action
            FROM security_events
            WHERE source_type = 'Cynet 360'
              AND (
                action ~* '^EPS Code \\d+$'
                OR action IN (
                  'Device Blocked','Device Allowed','Device Detected',
                  'MTP USB Device Blocked','MTP USB Device Allowed','MTP USB Device Detected',
                  'USB Device Blocked','USB Device Allowed','USB Device Detected',
                  'Bluetooth Device Blocked','Bluetooth Device Allowed',
                  'CD/DVD Device Blocked','CD/DVD Device Allowed',
                  'Printer Blocked','Printer Allowed',
                  'WiFi Adapter Blocked','WiFi Adapter Allowed',
                  'Storage Device Blocked','Storage Device Allowed'
                )
              )
          ),
          classified AS (
            SELECT
              id,
              action,
              -- State: Blocked > Allowed > Detected
              CASE
                WHEN lower(coalesce(m->>'deviceStatus','')) LIKE '%block%'
                  OR lower(coalesce(m->>'epsPrevention','')) LIKE '%block%'
                  THEN 'Blocked'
                WHEN lower(coalesce(m->>'deviceStatus','')) LIKE '%allow%'
                  OR lower(coalesce(m->>'epsPrevention','')) LIKE '%allow%'
                  THEN 'Allowed'
                ELSE 'Detected'
              END AS state,
              -- Device prefix from deviceType then deviceName keywords
              CASE
                WHEN lower(coalesce(m->>'deviceType','')) = 'mtp'
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%mtp%'
                  THEN 'MTP USB Device'
                WHEN lower(coalesce(m->>'deviceType','')) IN ('usb','removable')
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%usb%'
                  THEN 'USB Device'
                WHEN lower(coalesce(m->>'deviceType','')) = 'bluetooth'
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%bluetooth%'
                  THEN 'Bluetooth Device'
                WHEN lower(coalesce(m->>'deviceType','')) IN ('cdrom','cd','dvd')
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%cd%'
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%dvd%'
                  THEN 'CD/DVD Device'
                WHEN lower(coalesce(m->>'deviceType','')) = 'printer'
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%printer%'
                  THEN 'Printer'
                WHEN lower(coalesce(m->>'deviceType','')) IN ('wifi','wireless')
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%wifi%'
                  THEN 'WiFi Adapter'
                WHEN lower(coalesce(m->>'deviceType','')) = 'storage'
                  OR lower(coalesce(m->>'deviceName','')) LIKE '%storage%'
                  THEN 'Storage Device'
                WHEN m->>'deviceName' IS NOT NULL AND m->>'deviceName' != ''
                  THEN m->>'deviceName'
                ELSE NULL
              END AS device_prefix,
              -- Fallback: EPS remediation code lookup
              CASE m->>'epsRemediationCode'
                WHEN '0'  THEN 'No Action'        WHEN '1'  THEN 'Detected Only'
                WHEN '2'  THEN 'Process Killed'    WHEN '3'  THEN 'File Quarantined'
                WHEN '4'  THEN 'File Deleted'      WHEN '5'  THEN 'Network Connection Blocked'
                WHEN '6'  THEN 'Registry Key Removed' WHEN '7' THEN 'Scheduled Task Removed'
                WHEN '8'  THEN 'Service Stopped'   WHEN '9'  THEN 'File Restored'
                WHEN '10' THEN 'Endpoint Isolated' WHEN '11' THEN 'Memory Scan Completed'
                WHEN '12' THEN 'Script Blocked'    WHEN '13' THEN 'Exploit Prevented'
                WHEN '14' THEN 'Ransomware Rolled Back' WHEN '15' THEN 'Credential Theft Prevented'
                WHEN '16' THEN 'Lateral Movement Blocked' WHEN '17' THEN 'USB Device Blocked'
                WHEN '18' THEN 'USB Device Allowed' WHEN '19' THEN 'MTP Device Blocked'
                WHEN '20' THEN 'MTP Device Allowed' WHEN '21' THEN 'CD/DVD Device Blocked'
                WHEN '22' THEN 'CD/DVD Device Allowed' WHEN '23' THEN 'Bluetooth Device Blocked'
                WHEN '24' THEN 'Bluetooth Device Allowed' WHEN '25' THEN 'WiFi Adapter Blocked'
                WHEN '26' THEN 'WiFi Adapter Allowed' WHEN '27' THEN 'Printer Blocked'
                WHEN '28' THEN 'Printer Allowed'   WHEN '29' THEN 'Storage Device Detected (Blocked)'
                WHEN '30' THEN 'Storage Device Detected (Allowed)' WHEN '31' THEN 'Device Control Policy Applied'
                WHEN '32' THEN 'Device Blocked'    WHEN '33' THEN 'Device Allowed'
                WHEN '34' THEN 'File Transfer Blocked' WHEN '35' THEN 'File Transfer Allowed'
                WHEN '36' THEN 'Shadow Copy Deleted' WHEN '37' THEN 'Boot Sector Protected'
                WHEN '38' THEN 'MBR Protected'     WHEN '39' THEN 'Honeypot File Triggered'
                WHEN '40' THEN 'Decoy Document Accessed'
                ELSE NULL
              END AS eps_label,
              (m->>'isDeviceControl')::boolean AS is_device_control,
              m->>'deviceType' AS device_type,
              m->>'deviceName' AS device_name
            FROM meta
          ),
          resolved AS (
            SELECT
              id,
              action,
              CASE
                -- Priority 1: device context with state
                WHEN is_device_control = true
                  AND (device_type IS NOT NULL OR device_name IS NOT NULL)
                  AND device_prefix IS NOT NULL
                  THEN device_prefix || ' ' || state
                -- Priority 2: EPS code map
                WHEN eps_label IS NOT NULL THEN eps_label
                -- No context: keep existing
                ELSE action
              END AS new_action
            FROM classified
          )
          UPDATE security_events se
          SET action = r.new_action
          FROM resolved r
          WHERE se.id = r.id
            AND r.new_action IS DISTINCT FROM r.action
        `);

        await clientBf.query(
          `INSERT INTO migration_markers (key) VALUES ('eps_action_backfill_v2') ON CONFLICT DO NOTHING`
        );
        console.log(`[Migration] EPS action backfill v2 complete — ${updated.rowCount} events updated (Task #165)`);
      } else {
        console.log("[Migration] EPS action backfill v2 already ran — skipping.");
      }
    } catch (e: any) {
      console.error("[Migration] EPS action backfill error (non-fatal):", e.message);
    } finally {
      clientBf.release();
    }
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
