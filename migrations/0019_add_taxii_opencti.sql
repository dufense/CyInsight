-- Add extra_config column to platform_integrations for TAXII/OpenCTI metadata
ALTER TABLE "platform_integrations" ADD COLUMN IF NOT EXISTS "extra_config" jsonb;

--> statement-breakpoint

-- TAXII STIX IOC table (stores indicators from TAXII feeds)
CREATE TABLE IF NOT EXISTS "taxii_stix_iocs" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "indicator_type" ioc_type NOT NULL,
  "indicator_value" text NOT NULL,
  "reputation" ioc_reputation NOT NULL DEFAULT 'malicious',
  "confidence" integer DEFAULT 70,
  "source" text NOT NULL,
  "tags" jsonb DEFAULT '[]',
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "raw_stix" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- TAXII threat actors
CREATE TABLE IF NOT EXISTS "taxii_threat_actors" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "aliases" jsonb DEFAULT '[]',
  "sophistication" text,
  "primary_motivation" text,
  "country" text,
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "description" text,
  "source" text NOT NULL,
  "tags" jsonb DEFAULT '[]',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- TAXII campaigns
CREATE TABLE IF NOT EXISTS "taxii_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "objective" text,
  "source" text NOT NULL,
  "tags" jsonb DEFAULT '[]',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- TAXII malware
CREATE TABLE IF NOT EXISTS "taxii_malware" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "malware_types" jsonb DEFAULT '[]',
  "description" text,
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "kill_chain_phases" text,
  "source" text NOT NULL,
  "tags" jsonb DEFAULT '[]',
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- OpenCTI IOC cache (synced from OpenCTI API + live stream)
CREATE TABLE IF NOT EXISTS "opencti_ioc_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "indicator_type" ioc_type NOT NULL,
  "indicator_value" text NOT NULL,
  "reputation" ioc_reputation NOT NULL DEFAULT 'malicious',
  "confidence" integer DEFAULT 70,
  "score" integer DEFAULT 0,
  "source" text NOT NULL DEFAULT 'opencti',
  "labels" jsonb DEFAULT '[]',
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- OpenCTI threat actors cache
CREATE TABLE IF NOT EXISTS "opencti_threat_actors_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "aliases" jsonb DEFAULT '[]',
  "description" text,
  "sophistication" text,
  "primary_motivation" text,
  "country" text,
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "confidence" integer DEFAULT 50,
  "score" integer DEFAULT 0,
  "linked_ioc_count" integer DEFAULT 0,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- OpenCTI campaigns cache
CREATE TABLE IF NOT EXISTS "opencti_campaigns_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "aliases" jsonb DEFAULT '[]',
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "objective" text,
  "confidence" integer DEFAULT 50,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- OpenCTI malware cache
CREATE TABLE IF NOT EXISTS "opencti_malware_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "stix_id" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "aliases" jsonb DEFAULT '[]',
  "malware_types" jsonb DEFAULT '[]',
  "kill_chain_phases" text,
  "first_seen" timestamptz,
  "last_seen" timestamptz,
  "confidence" integer DEFAULT 70,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

--> statement-breakpoint

-- OpenCTI IOC context: links enriched IOC values to their OpenCTI attribution
-- (threat actor / campaign / malware) at the point of incident enrichment.
CREATE TABLE IF NOT EXISTS "opencti_ioc_context" (
  "id" serial PRIMARY KEY NOT NULL,
  "ioc_value" text NOT NULL,
  "ioc_type" text NOT NULL,
  "stix_id" text,
  "actor_name" text,
  "actor_stix_id" text,
  "campaign_name" text,
  "campaign_stix_id" text,
  "malware_family" text,
  "malware_stix_id" text,
  "confidence" integer DEFAULT 70,
  "score" integer DEFAULT 0,
  "incident_id" integer,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "opencti_ioc_context_ioc_value_idx" ON "opencti_ioc_context" ("ioc_value");
CREATE INDEX IF NOT EXISTS "opencti_ioc_context_incident_id_idx" ON "opencti_ioc_context" ("incident_id");
