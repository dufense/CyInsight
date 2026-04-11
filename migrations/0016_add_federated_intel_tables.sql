CREATE TABLE IF NOT EXISTS "shared_threat_intel" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_ioc_value" text NOT NULL,
  "ioc_type" text NOT NULL,
  "reputation" text NOT NULL DEFAULT 'malicious',
  "confidence" integer NOT NULL DEFAULT 80,
  "threat_type" text,
  "tags" jsonb DEFAULT '[]',
  "contributor_count" integer NOT NULL DEFAULT 1,
  "match_count" integer NOT NULL DEFAULT 0,
  "propagated_at" timestamptz NOT NULL DEFAULT NOW(),
  "expires_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "tenant_intel_nominations" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ioc_value" text NOT NULL,
  "ioc_type" text NOT NULL,
  "confidence" integer NOT NULL DEFAULT 80,
  "reputation" text NOT NULL DEFAULT 'malicious',
  "threat_type" text,
  "tags" jsonb DEFAULT '[]',
  "source_incident_id" integer,
  "source_ioc_id" integer,
  "status" text NOT NULL DEFAULT 'pending',
  "nominated_by" text NOT NULL,
  "approved_by" text,
  "approved_at" timestamptz,
  "rejection_reason" text,
  "shared_threat_intel_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "tenant_intel_sharing_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "sharing_enabled" boolean NOT NULL DEFAULT false,
  "receiving_enabled" boolean NOT NULL DEFAULT true,
  "ioc_contributed" integer NOT NULL DEFAULT 0,
  "ioc_received" integer NOT NULL DEFAULT 0,
  "contribution_score" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "community_alert_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "shared_threat_intel_id" integer NOT NULL,
  "ioc_value" text NOT NULL,
  "ioc_type" text NOT NULL,
  "matched_event_count" integer NOT NULL DEFAULT 0,
  "severity" text NOT NULL DEFAULT 'medium',
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_shared_intel_ioc_value" ON "shared_threat_intel" ("source_ioc_value");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shared_intel_type_value" ON "shared_threat_intel" ("ioc_type", "source_ioc_value") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "idx_nominations_status" ON "tenant_intel_nominations" ("status");
CREATE INDEX IF NOT EXISTS "idx_nominations_tenant" ON "tenant_intel_nominations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_community_alerts_tenant" ON "community_alert_notifications" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_community_alerts_tenant_shared" ON "community_alert_notifications" ("tenant_id", "shared_threat_intel_id");

-- Pre-deduplicate threat_intel_iocs before enforcing uniqueness.
-- Keeps the highest-confidence row per (tenant_id, indicator_type, indicator_value).
-- This is idempotent: if duplicates don't exist, no rows are deleted.
DELETE FROM "threat_intel_iocs"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("tenant_id", "indicator_type", "indicator_value") "id"
  FROM "threat_intel_iocs"
  ORDER BY "tenant_id", "indicator_type", "indicator_value", "confidence" DESC NULLS LAST, "id" DESC
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_threat_intel_iocs_tenant_type_value" ON "threat_intel_iocs" ("tenant_id", "indicator_type", "indicator_value");
