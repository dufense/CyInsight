CREATE TABLE IF NOT EXISTS "cve_risk_scores" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cve_id" text NOT NULL,
  "cvss_score" text,
  "epss_score" text,
  "predicted_exploit_risk" integer,
  "affected_assets" integer DEFAULT 0,
  "patch_available" boolean DEFAULT false,
  "exploited_in_wild" boolean DEFAULT false,
  "ai_rationale" text,
  "mitre_techniques" text[] DEFAULT '{}',
  "severity" text,
  "cvss_vector" text,
  "published_date" timestamp,
  "last_seen" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "federated_threat_indicators" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "indicator_type" text NOT NULL,
  "indicator_value" text NOT NULL,
  "threat_type" text,
  "confidence" integer DEFAULT 70,
  "severity" text DEFAULT 'medium',
  "tlp_level" text DEFAULT 'amber',
  "tags" text[] DEFAULT '{}',
  "first_seen" timestamp DEFAULT now(),
  "last_seen" timestamp DEFAULT now(),
  "expires_at" timestamp,
  "shared_count" integer DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_detection_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "rule_type" text NOT NULL,
  "rule_content" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "mitre_attack_ids" text[] DEFAULT '{}',
  "kill_chain_phases" text[] DEFAULT '{}',
  "false_positive_rate" text,
  "true_positive_rate" text,
  "generated_from_event_ids" integer[] DEFAULT '{}',
  "generated_from_anomaly_ids" integer[] DEFAULT '{}',
  "ai_confidence" integer DEFAULT 70,
  "test_results" jsonb,
  "tags" text[] DEFAULT '{}',
  "severity" text DEFAULT 'medium',
  "generated_by" text DEFAULT 'ai',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now()
);
