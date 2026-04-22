DO $$ BEGIN
  CREATE TYPE "public"."activity_status" AS ENUM('not_started', 'in_progress', 'completed', 'delayed', 'blocked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."asset_status" AS ENUM('active', 'inactive', 'decommissioned', 'quarantined');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."case_priority" AS ENUM('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."case_status" AS ENUM('open', 'investigating', 'contained', 'remediated', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."challenge_category" AS ENUM('incident_response', 'threat_hunting', 'compliance', 'asset_management', 'collaboration', 'sla_performance');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."challenge_difficulty" AS ENUM('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."challenge_type" AS ENUM('daily', 'weekly', 'monthly', 'one_time');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."cti_sophistication" AS ENUM('none', 'minimal', 'intermediate', 'advanced', 'expert', 'innovator', 'strategic');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."db_connector_type" AS ENUM('postgresql', 'mysql', 'mariadb', 'mssql', 'clickhouse', 'timescaledb', 'snowflake', 'bigquery', 'redshift', 'databricks', 'iceberg');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."deployment_status" AS ENUM('deployed', 'partial', 'planned', 'not_deployed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."detection_feedback_type" AS ENUM('true_positive', 'false_positive', 'benign');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."dlq_status" AS ENUM('failed', 'retrying', 'recovered', 'abandoned');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."document_category" AS ENUM('knowledge_transfer', 'implementation', 'sop', 'runbook', 'policy', 'architecture', 'training', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."document_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."event_type" AS ENUM('email', 'endpoint', 'vulnerability', 'casb', 'waf', 'dlp', 'sse', 'network', 'identity', 'cloud', 'web', 'database', 'ot_iot');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."feed_type" AS ENUM('stix_taxii', 'csv', 'json', 'api', 'custom');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."feedback_type" AS ENUM('verdict_correction', 'severity_adjustment', 'fp_pattern_add', 'recommendation_quality', 'general');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."heal_failure_type" AS ENUM('auth_failure', 'endpoint_changed', 'rate_limited', 'schema_changed', 'connectivity', 'api_version', 'ssl_error', 'unknown');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."hunt_session_status" AS ENUM('active', 'paused', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."incident_status" AS ENUM('open', 'investigating', 'contained', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."infra_type" AS ENUM('on-prem', 'hybrid', 'cloud');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ingest_batch_status" AS ENUM('queued', 'normalizing', 'enriching', 'scoring', 'correlating', 'complete', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ingest_channel" AS ENUM('api', 'file', 'connector');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."integration_audit_action" AS ENUM('created', 'updated', 'deleted', 'restored', 'test_connection', 'pull_data');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."integration_category" AS ENUM('edr_xdr', 'sse_casb', 'dlp', 'email_security', 'waf', 'tip_easm', 'vulnerability_management', 'directory_services', 'network_security', 'endpoint_security', 'siem', 'soar', 'patch_mgmt', 'hardware_infra', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."integration_status" AS ENUM('connected', 'disconnected', 'error', 'configuring', 'disabled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."investigation_status" AS ENUM('queued', 'investigating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."investigation_type" AS ENUM('auto_triage', 'deep_investigation', 'forensic_analysis', 'campaign_hunt', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ioc_reputation" AS ENUM('malicious', 'suspicious', 'clean', 'unknown');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ioc_type" AS ENUM('ip', 'domain', 'hash_md5', 'hash_sha1', 'hash_sha256', 'url', 'email', 'filename', 'registry_key', 'mutex');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."leaderboard_period" AS ENUM('daily', 'weekly', 'monthly', 'all_time');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."license_status" AS ENUM('active', 'expired', 'suspended', 'trial');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."log_source_protocol" AS ENUM('syslog_udp', 'syslog_tcp', 'syslog_tls', 'http_webhook', 'cef', 'leef', 'json', 'xml', 'plaintext', 'file_upload', 'api_pull');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."log_source_type" AS ENUM('firewall', 'ids_ips', 'waf', 'proxy', 'edr', 'email_gateway', 'database_monitor', 'casb', 'cloud', 'ot_iot', 'network_tap', 'siem', 'identity', 'vulnerability_scanner', 'custom');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."pipeline_status" AS ENUM('received', 'normalized', 'enriched', 'correlated', 'stored');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."playbook_exec_status" AS ENUM('running', 'completed', 'failed', 'partial');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."playbook_status" AS ENUM('active', 'inactive', 'draft');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."quota_tier" AS ENUM('standard', 'professional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."raci_type" AS ENUM('responsible', 'accountable', 'consulted', 'informed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."report_type" AS ENUM('executive_summary', 'endpoint', 'email', 'vulnerability', 'compliance', 'threat_intelligence', 'incident_response', 'cloud_security', 'asset_inventory', 'threat_landscape', 'sla_performance', 'soc_operations', 'risk_posture');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."risk_entity_type" AS ENUM('asset', 'user', 'ip', 'domain');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."risk_impact" AS ENUM('negligible', 'minor', 'moderate', 'major', 'severe');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."risk_probability" AS ENUM('very_low', 'low', 'medium', 'high', 'very_high');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."risk_status" AS ENUM('open', 'mitigating', 'accepted', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM('platform_admin', 'mss_admin', 'mss_analyst', 'customer', 'security_engineer', 'service_desk', 'security_analyst', 'soc_manager');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."scope_type" AS ENUM('inclusion', 'exclusion');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."suppression_action" AS ENUM('suppress', 'deprioritize');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."task_status" AS ENUM('backlog', 'todo', 'in_progress', 'review', 'done');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."team_type" AS ENUM('implementation', 'mss');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."tenant_type" AS ENUM('mssp', 'customer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ticket_priority" AS ENUM('urgent', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."mfa_device_type" AS ENUM('totp', 'sms', 'webauthn', 'radius');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."sso_provider_type" AS ENUM('entra_id', 'google', 'okta', 'generic_oidc', 'saml_miniorange', 'saml_rsa', 'saml_generic');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"activity_id" integer,
	"description" text NOT NULL,
	"log_type" varchar(50) DEFAULT 'update' NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_agent_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"target_id" integer,
	"target_type" varchar(50),
	"summary" text,
	"details" jsonb,
	"confidence" integer,
	"human_reviewed" boolean DEFAULT false,
	"human_override" boolean DEFAULT false,
	"feedback" text,
	"duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_detection_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text NOT NULL,
	"rule_content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"mitre_attack_ids" text[] DEFAULT '{}',
	"kill_chain_phases" text[] DEFAULT '{}',
	"false_positive_rate" text,
	"true_positive_rate" text,
	"generated_from_event_ids" integer[] DEFAULT '{}',
	"generated_from_anomaly_ids" integer[] DEFAULT '{}',
	"generated_from_incident_id" integer,
	"ai_confidence" integer DEFAULT 70,
	"test_results" jsonb,
	"tags" text[] DEFAULT '{}',
	"severity" text DEFAULT 'medium',
	"generated_by" text DEFAULT 'ai',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_investigations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"incident_id" integer NOT NULL,
	"status" "investigation_status" DEFAULT 'queued' NOT NULL,
	"investigation_type" "investigation_type" DEFAULT 'auto_triage' NOT NULL,
	"findings" jsonb,
	"recommendations" jsonb,
	"executive_summary" text,
	"technical_report" text,
	"risk_score" integer,
	"confidence_score" integer,
	"related_incident_ids" integer[],
	"investigation_steps" jsonb,
	"attack_chain" jsonb,
	"iocs_summary" jsonb,
	"affected_entities" jsonb,
	"verdict" varchar(50),
	"verdict_reasoning" text,
	"decision_metrics" jsonb,
	"agent_pipeline" jsonb,
	"investigation_plan" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_learning_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"incident_id" integer,
	"analyst_id" varchar(255),
	"severity" varchar(20),
	"source_type" varchar(100),
	"ioc_count" integer DEFAULT 0,
	"mitre_tactic" varchar(100),
	"asset_criticality" varchar(20),
	"ai_suggested_classification" varchar(20),
	"ai_confidence" integer,
	"analyst_verdict" varchar(20) NOT NULL,
	"ai_matched" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_ticket_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"step_name" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"agent_name" varchar(100),
	"confidence" integer,
	"output_text" text,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analyst_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"investigation_id" integer,
	"incident_id" integer,
	"analyst_user_id" varchar(255),
	"feedback_type" "feedback_type" DEFAULT 'general' NOT NULL,
	"verdict_override" varchar(50),
	"severity_override" varchar(20),
	"original_verdict" varchar(50),
	"original_severity" varchar(20),
	"feedback_notes" text,
	"is_used_for_learning" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_category_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"app_name" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"source_asset" varchar(255) NOT NULL,
	"target_asset" varchar(255) NOT NULL,
	"connection_type" varchar(100) DEFAULT 'network' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"technique" varchar(255),
	"mitre_technique" varchar(50),
	"metadata" jsonb,
	"last_seen" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"ip_address" varchar(100),
	"ipv6_address" varchar(200),
	"mac_address" varchar(50),
	"endpoint_type" varchar(50),
	"operating_system" varchar(200),
	"agent_version" varchar(100),
	"content_version" varchar(100),
	"user_name" varchar(255),
	"endpoint_alias" varchar(255),
	"endpoint_group" varchar(255),
	"prevention_policy" varchar(255),
	"extensions_policy" varchar(255),
	"deployment_type" varchar(50),
	"cloud_provider" varchar(100),
	"cloud_region" varchar(100),
	"cloud_instance_id" varchar(200),
	"tags" text,
	"last_seen" timestamp,
	"last_upgrade_status" varchar(100),
	"last_upgrade_time" timestamp,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"risk_level" varchar(20),
	"risk_score" integer,
	"incident_count" integer DEFAULT 0,
	"vulnerability_count" integer DEFAULT 0,
	"enrichment_data" jsonb,
	"source" varchar(100) DEFAULT 'import',
	"bios_serial_number" varchar(255),
	"processor" varchar(500),
	"total_physical_memory" varchar(100),
	"storage_info" text,
	"system_model" varchar(500),
	"system_manufacturer" varchar(255),
	"device_health" varchar(100),
	"last_logged_in_user" varchar(255),
	"software_inventory" jsonb,
	"warranty_expiry" timestamp,
	"warranty_status" varchar(30),
	"warranty_contract_id" varchar(255),
	"purchase_date" timestamp,
	"license_key" varchar(500),
	"license_expiry" timestamp,
	"license_status_asset" varchar(30),
	"asset_location" varchar(255),
	"asset_site" varchar(255),
	"asset_building" varchar(100),
	"asset_group" varchar(255),
	"memory_type" varchar(50),
	"processor_cores" integer,
	"processor_speed" varchar(50),
	"primary_user_email" varchar(255),
	"primary_user_id" varchar(100),
	"linked_user_ids" jsonb DEFAULT '[]'::jsonb,
	"controls_coverage" jsonb DEFAULT '[]'::jsonb,
	"warranty_lookup_data" jsonb,
	"eol_findings" jsonb DEFAULT '[]'::jsonb,
	"source_platforms" jsonb DEFAULT '[]'::jsonb,
	"cis_score" integer,
	"cis_benchmark" varchar(100),
	"criticality" varchar(20),
	"edr_host_id" varchar(255),
	"edr_platform" varchar(100),
	"edr_schedule_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_assets_tenant_hostname" UNIQUE("tenant_id","hostname")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attack_chain_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"chain_id" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"attack_categories" text[] DEFAULT '{}',
	"kill_chain_phases" text[] DEFAULT '{}',
	"shared_entities" jsonb DEFAULT '{"ips":[],"users":[],"hosts":[],"hashes":[]}'::jsonb,
	"event_ids" integer[] DEFAULT '{}',
	"detection_ids" integer[] DEFAULT '{}',
	"incident_id" integer,
	"overall_confidence" integer DEFAULT 0,
	"severity" varchar(20) DEFAULT 'medium',
	"time_window_minutes" integer DEFAULT 60,
	"promoted_to_incident" boolean DEFAULT false,
	"first_event_at" timestamp,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attack_chain_groups_chain_id_unique" UNIQUE("chain_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attack_detections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"event_id" integer,
	"incident_id" integer,
	"attack_category" varchar(100) NOT NULL,
	"sub_type" varchar(200),
	"confidence" integer DEFAULT 0 NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"mitre_attack_id" varchar(50),
	"mitre_attack_ids" text[] DEFAULT '{}',
	"kill_chain_phase" varchar(100),
	"explanation" text,
	"entities" jsonb DEFAULT '{"ips":[],"users":[],"hosts":[],"hashes":[],"domains":[]}'::jsonb,
	"signal_score" integer DEFAULT 0,
	"signals" jsonb DEFAULT '[]'::jsonb,
	"behavioral_deviation_score" integer DEFAULT 0,
	"attack_chain_id" varchar(100),
	"raw_context" jsonb,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bas_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"scenario_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"triggered_by" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"overall_score" integer,
	"detection_score" integer,
	"prevention_score" integer,
	"exposure_score" integer,
	"results" jsonb DEFAULT '[]'::jsonb,
	"ai_analysis" text,
	"recommendations" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bas_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"mitre_attack_ids" text[] DEFAULT '{}',
	"kill_chain_phases" text[] DEFAULT '{}',
	"severity" text DEFAULT 'medium' NOT NULL,
	"attack_vectors" jsonb DEFAULT '[]'::jsonb,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavior_anomalies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_name" varchar(255) NOT NULL,
	"anomaly_type" varchar(100) NOT NULL,
	"dimensions" jsonb,
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"marked_expected" boolean DEFAULT false NOT NULL,
	"escalated_to_incident" boolean DEFAULT false NOT NULL,
	"escalated_incident_id" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavioral_baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_name" varchar(255) NOT NULL,
	"dimension_key" varchar(100) NOT NULL,
	"baseline_mean" double precision DEFAULT 0 NOT NULL,
	"baseline_std_dev" double precision DEFAULT 1 NOT NULL,
	"peer_group_mean" double precision DEFAULT 0 NOT NULL,
	"peer_group_std_dev" double precision DEFAULT 1 NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_type" varchar(100),
	"file_size" integer,
	"hash" varchar(128),
	"uploaded_by" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"incident_id" integer NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"linked_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"action" varchar(255) NOT NULL,
	"actor" varchar(255),
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"priority" "case_priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" varchar(255),
	"created_by" varchar(255),
	"mitre_tactics" text[],
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_confidence_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"attack_category" varchar(100) NOT NULL,
	"min_confidence_threshold" integer DEFAULT 40,
	"tp_count" integer DEFAULT 0,
	"fp_count" integer DEFAULT 0,
	"benign_count" integer DEFAULT 0,
	"few_shot_examples" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "category_thresholds_tenant_category_uniq" UNIQUE("tenant_id","attack_category")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clickhouse_ingest_outages" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" integer,
	"threshold_minutes" integer NOT NULL,
	"sample_window_seconds" integer NOT NULL,
	"notifications_dispatched" integer DEFAULT 0 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"reason" varchar(32) DEFAULT 'stalled_ingest' NOT NULL,
	"tenant_id" integer,
	"failure_rate_percent" integer,
	"attempts" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cloud_app_risk_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_score_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"category" varchar(100) NOT NULL,
	"attribute" varchar(200) NOT NULL,
	"value" varchar(500),
	"score" real DEFAULT 0,
	"weight" real DEFAULT 0,
	"weighted_score" real DEFAULT 0,
	"risk_level" varchar(20),
	"review_date" varchar(30),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cloud_app_risk_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"app_name" varchar(500) NOT NULL,
	"source" varchar(30) DEFAULT 'platform',
	"confidence_index" real DEFAULT 0 NOT NULL,
	"risk_classification" varchar(20) DEFAULT 'moderate' NOT NULL,
	"sanction_status" varchar(50),
	"service_category" varchar(100),
	"is_ai_service" boolean DEFAULT false,
	"is_shadow_it" boolean DEFAULT false,
	"is_enterprise" boolean DEFAULT false,
	"total_users" integer DEFAULT 0,
	"total_activities" integer DEFAULT 0,
	"total_uploads" integer DEFAULT 0,
	"total_downloads" integer DEFAULT 0,
	"countries" jsonb,
	"factor_scores" jsonb,
	"factor_details" jsonb,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_alert_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"shared_threat_intel_id" integer NOT NULL,
	"ioc_value" text NOT NULL,
	"ioc_type" text NOT NULL,
	"matched_event_count" integer DEFAULT 0 NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"framework_id" varchar(50) NOT NULL,
	"overall_score" real DEFAULT 0 NOT NULL,
	"function_scores" jsonb,
	"control_statuses" jsonb,
	"gap_analysis" jsonb,
	"assessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crown_jewel_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_id" varchar(255) NOT NULL,
	"asset_name" varchar(255) NOT NULL,
	"criticality" varchar(50) DEFAULT 'high' NOT NULL,
	"label" varchar(255),
	"tagged_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cti_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"aliases" text[],
	"description" text,
	"objective" text,
	"first_seen" timestamp,
	"last_seen" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"status" varchar(50) DEFAULT 'active',
	"confidence" integer DEFAULT 50,
	"attribution" varchar(200),
	"target_sectors" text[],
	"target_regions" text[],
	"ttps" text[],
	"tools_used" text[],
	"ioc_count" integer DEFAULT 0,
	"incident_count" integer DEFAULT 0,
	"stix_id" varchar(100),
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cti_campaigns_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cti_intel_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" varchar(300) NOT NULL,
	"report_type" varchar(50) DEFAULT 'threat-report',
	"tlp_level" varchar(20) DEFAULT 'amber',
	"description" text,
	"content" text,
	"published_at" timestamp DEFAULT now(),
	"authors" text[],
	"labels" text[],
	"related_actors" text[],
	"related_campaigns" text[],
	"related_malware" text[],
	"ioc_count" integer DEFAULT 0,
	"confidence" integer DEFAULT 70,
	"stix_id" varchar(100),
	"external_url" text,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cti_intel_reports_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cti_intrusion_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"aliases" text[],
	"description" text,
	"primary_motivation" varchar(100),
	"secondary_motivations" text[],
	"resource_level" varchar(50),
	"sophistication" "cti_sophistication" DEFAULT 'advanced',
	"goals" text[],
	"target_sectors" text[],
	"target_countries" text[],
	"ttps" text[],
	"tools_used" text[],
	"first_seen" timestamp,
	"last_seen" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"confidence" integer DEFAULT 50,
	"stix_id" varchar(100),
	"tags" text[],
	"campaign_count" integer DEFAULT 0,
	"indicator_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cti_intrusion_sets_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cti_malware_families" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"aliases" text[],
	"malware_types" text[],
	"description" text,
	"is_family" boolean DEFAULT true NOT NULL,
	"kill_chain_phases" text[],
	"capabilities" text[],
	"operating_systems" text[],
	"architectures" text[],
	"programming_languages" text[],
	"first_seen" timestamp,
	"last_seen" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"confidence" integer DEFAULT 70,
	"cvss_score" real,
	"ttps" text[],
	"ioc_count" integer DEFAULT 0,
	"sample_count" integer DEFAULT 0,
	"stix_id" varchar(100),
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cti_malware_families_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cti_threat_actors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"aliases" text[],
	"threat_actor_types" text[],
	"sophistication" "cti_sophistication" DEFAULT 'intermediate',
	"resource_level" varchar(50),
	"primary_motivation" varchar(100),
	"goals" text[],
	"roles" text[],
	"country" varchar(100),
	"first_seen" timestamp,
	"last_seen" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"confidence" integer DEFAULT 50,
	"description" text,
	"stix_id" varchar(100),
	"tags" text[],
	"indicator_count" integer DEFAULT 0,
	"campaign_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cti_threat_actors_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cve_risk_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"threat_actor_ids" jsonb DEFAULT '[]'::jsonb,
	"asset_exposure_level" text DEFAULT 'internal',
	"risk_trend" jsonb DEFAULT '[]'::jsonb,
	"estimated_risk_reduction" integer,
	"patch_priority" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cyber_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"prediction_window_days" integer DEFAULT 30 NOT NULL,
	"overall_confidence" integer,
	"accuracy_score" integer,
	"status" varchar(20) DEFAULT 'complete' NOT NULL,
	"predictions" jsonb,
	"input_signal_counts" jsonb,
	"vectors" jsonb,
	"risk_timeline" jsonb,
	"emerging_indicators" jsonb,
	"predicted_targets" jsonb,
	"narrative" text,
	"model_used" varchar(100),
	"signal_summary" jsonb,
	"accuracy_feedback" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_retention_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"hot_retention_days" integer DEFAULT 90 NOT NULL,
	"warm_retention_days" integer DEFAULT 365 NOT NULL,
	"cold_retention_days" integer DEFAULT 2555 NOT NULL,
	"export_format" varchar(50) DEFAULT 'parquet' NOT NULL,
	"partition_strategy" varchar(50) DEFAULT 'tenant_time' NOT NULL,
	"warm_connector_id" integer,
	"cold_connector_id" integer,
	"last_export_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "db_connectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"connector_type" "db_connector_type" NOT NULL,
	"host" text,
	"port" integer,
	"database" text,
	"credential_blob" text,
	"ssl_mode" text DEFAULT 'prefer',
	"extra_params" jsonb,
	"status" text DEFAULT 'unconfigured' NOT NULL,
	"last_tested_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"tenant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detection_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"detection_id" integer,
	"incident_id" integer,
	"analyst_user_id" varchar(255) NOT NULL,
	"feedback_type" "detection_feedback_type" NOT NULL,
	"attack_category" varchar(100),
	"original_confidence" integer,
	"notes" text,
	"used_for_training" boolean DEFAULT false,
	"training_weight" real DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"source_identifier" varchar(255) NOT NULL,
	"vendor" varchar(200),
	"product" varchar(200),
	"log_format" varchar(100),
	"event_category" varchar(100),
	"detected_fields" jsonb DEFAULT '[]'::jsonb,
	"sample_log_lines" text[] DEFAULT '{}',
	"ai_confidence" integer DEFAULT 0,
	"ai_reasoning" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_posture_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enforcement" varchar(50) DEFAULT 'all_must_pass' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text,
	"category" "document_category" DEFAULT 'other' NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"tags" text,
	"customer_visible" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	"source_product" varchar(200),
	"doc_type" varchar(100),
	"generated_version" integer DEFAULT 1,
	"is_auto_generated" boolean DEFAULT false,
	"official_urls" text,
	"stale_days" integer DEFAULT 90,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edr_cis_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"edr_platform" varchar(100) NOT NULL,
	"os_type" varchar(50) NOT NULL,
	"score" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"triggered_by" varchar(255) DEFAULT 'system' NOT NULL,
	"status" varchar(30) DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"run_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edr_remediation_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"edr_platform" varchar(100) NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"command_key" varchar(100),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"triggered_by" varchar(255) NOT NULL,
	"edr_response" jsonb,
	"error_message" text,
	"run_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb NOT NULL,
	"from_email" varchar(255) NOT NULL,
	"from_name" varchar(255),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_dead_letter_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"raw_payload" jsonb,
	"error_message" text,
	"error_stack" text,
	"pipeline_stage" varchar(50),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"status" "dlq_status" DEFAULT 'failed' NOT NULL,
	"batch_id" integer,
	"last_retry_at" timestamp,
	"recovered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "federated_threat_indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_tenant_id" integer NOT NULL,
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
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hunt_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"hypothesis" text,
	"query" jsonb,
	"findings" text,
	"hunt_session_status" "hunt_session_status" DEFAULT 'active' NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hunt_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"nl_query" text NOT NULL,
	"resolved_filters" jsonb DEFAULT '{}'::jsonb,
	"search_description" text,
	"created_by" varchar(255),
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"type" varchar(50) DEFAULT 'note' NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"added_by" varchar(255),
	"chain_of_custody_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"incident_id" integer NOT NULL,
	"investigation_id" integer,
	"recipients" text[] NOT NULL,
	"notification_type" varchar(50) DEFAULT 'ai_investigation_complete' NOT NULL,
	"domain" varchar(50),
	"verdict" varchar(50),
	"email_subject" text,
	"email_body" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"action_token" varchar(100),
	"action_taken" varchar(50),
	"action_taken_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_response_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"incident_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"target" varchar(500) NOT NULL,
	"target_type" varchar(50),
	"risk_level" varchar(20) DEFAULT 'medium' NOT NULL,
	"rationale" text,
	"expected_impact" text,
	"estimated_seconds" integer DEFAULT 30,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"approved_by" varchar(255),
	"approved_at" timestamp,
	"executed_at" timestamp,
	"executed_by" varchar(255),
	"is_reversible" boolean DEFAULT true,
	"undone_at" timestamp,
	"undone_by" varchar(255),
	"execution_result" jsonb,
	"step_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_response_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"incident_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"mode" varchar(20) DEFAULT 'manual' NOT NULL,
	"status" varchar(30) DEFAULT 'ready' NOT NULL,
	"generated_by" varchar(255) DEFAULT 'ai' NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"execution_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"source" varchar(100),
	"category" varchar(100),
	"incident_type" varchar(100),
	"source_ip" varchar(200),
	"destination_ip" varchar(200),
	"action_taken" text,
	"detection_source" varchar(200),
	"affected_assets" text,
	"recommendation" text,
	"assigned_to" varchar,
	"mitre_tactic" varchar(200),
	"mitre_technique_id" varchar(50),
	"mitre_technique" varchar(200),
	"kill_chain_phase" varchar(100),
	"confidence_score" integer,
	"is_true_positive" boolean,
	"classification" varchar(50),
	"ioc_data" jsonb,
	"dedup_hash" varchar(64),
	"sigma_matches" jsonb,
	"contextual_analysis" jsonb,
	"threat_narrative" text,
	"enriched_description" text,
	"triage_score" integer,
	"triage_reasoning" text,
	"triage_suggested_classification" varchar(20),
	"triage_scored_at" timestamp,
	"resolved_at" timestamp,
	"investigated_at" timestamp,
	"ai_classification" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "infrastructure_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"infra_type" "infra_type" NOT NULL,
	"cloud_provider" varchar(100),
	"regional_dc" varchar(100),
	"public_ip_ranges" jsonb DEFAULT '[]'::jsonb,
	"private_ip_ranges" jsonb DEFAULT '[]'::jsonb,
	"asset_types" jsonb DEFAULT '[]'::jsonb,
	"connected_location_ids" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"city" varchar(150),
	"country_code" varchar(5),
	"latitude" real,
	"longitude" real,
	"hostname_keywords" text[] DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingest_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"permissions" jsonb,
	"last_used_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingest_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"source" varchar(255),
	"channel" "ingest_channel" DEFAULT 'api' NOT NULL,
	"status" "ingest_batch_status" DEFAULT 'queued' NOT NULL,
	"total_events" integer DEFAULT 0 NOT NULL,
	"processed_events" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"integration_id" integer,
	"platform_name" varchar(200) NOT NULL,
	"platform_key" varchar(100) NOT NULL,
	"action" "integration_audit_action" NOT NULL,
	"user_id" varchar(100),
	"username" varchar(200),
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_heal_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"platform_key" varchar(100) NOT NULL,
	"platform_name" varchar(200) NOT NULL,
	"failure_type" "heal_failure_type" NOT NULL,
	"error_message" text,
	"heal_strategy" varchar(200),
	"config_patch" jsonb,
	"succeeded" boolean NOT NULL,
	"result_message" text,
	"ai_diagnosis" text,
	"consecutive_failures_at_attempt" integer DEFAULT 0,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investigation_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"tenant_id" integer NOT NULL,
	"analyst_id" varchar(255) NOT NULL,
	"export_name" varchar(255),
	"row_count" integer DEFAULT 0,
	"file_hash" varchar(64),
	"s3_key" varchar(500),
	"query_params" jsonb DEFAULT '{}'::jsonb,
	"bundle_data" "bytea",
	"exported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investigation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"analyst_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"source_mode" varchar(20) DEFAULT 'live' NOT NULL,
	"query_params" jsonb DEFAULT '{}'::jsonb,
	"last_run_at" timestamp,
	"result_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"tenant_id" integer NOT NULL,
	"period" "leaderboard_period" NOT NULL,
	"period_start" timestamp NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"challenges_completed" integer DEFAULT 0 NOT NULL,
	"incidents_resolved" integer DEFAULT 0 NOT NULL,
	"tickets_closed" integer DEFAULT 0 NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"license_type" varchar(100) NOT NULL,
	"max_users" integer DEFAULT 10 NOT NULL,
	"max_endpoints" integer,
	"status" "license_status" DEFAULT 'active' NOT NULL,
	"start_date" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "log_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"source_type" "log_source_type" DEFAULT 'custom' NOT NULL,
	"protocol" "log_source_protocol" DEFAULT 'json' NOT NULL,
	"host" varchar(255),
	"port" integer,
	"expected_format" varchar(100),
	"tags" text[] DEFAULT '{}',
	"fingerprint_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_markers" (
	"key" text PRIMARY KEY NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opencti_campaigns_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"objective" text,
	"confidence" integer DEFAULT 50,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opencti_campaigns_cache_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opencti_ioc_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"indicator_type" varchar(50) NOT NULL,
	"indicator_value" text NOT NULL,
	"reputation" varchar(30) DEFAULT 'malicious',
	"confidence" integer DEFAULT 70,
	"score" integer DEFAULT 0,
	"source" text DEFAULT 'opencti' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opencti_ioc_cache_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opencti_malware_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"malware_types" jsonb DEFAULT '[]'::jsonb,
	"kill_chain_phases" text,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"confidence" integer DEFAULT 70,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opencti_malware_cache_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opencti_threat_actors_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"sophistication" text,
	"primary_motivation" text,
	"country" text,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"confidence" integer DEFAULT 50,
	"score" integer DEFAULT 0,
	"linked_ioc_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "opencti_threat_actors_cache_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_stakeholders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"subcategory" varchar(100) NOT NULL,
	"stakeholder_name" varchar(255) NOT NULL,
	"stakeholder_email" varchar(255) NOT NULL,
	"stakeholder_role" varchar(100) NOT NULL,
	"stakeholder_phone" varchar(50),
	"stakeholder_department" varchar(150),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"category" varchar(50) DEFAULT 'threat_intel' NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"requires_key" boolean DEFAULT false NOT NULL,
	"api_key" text,
	"last_tested_at" timestamp,
	"test_status" varchar(20) DEFAULT 'untested',
	"test_message" text,
	"extra_config" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_integrations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"type" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"action_url" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(128) NOT NULL,
	"prev_value" jsonb,
	"new_value" jsonb NOT NULL,
	"changed_by" varchar(255),
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playbook_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"playbook_id" integer NOT NULL,
	"incident_id" integer,
	"tenant_id" integer NOT NULL,
	"exec_id" varchar(64),
	"dry_run" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"step_results" jsonb DEFAULT '[]'::jsonb,
	"triggered_by" varchar(255),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "playbook_executions_exec_id_unique" UNIQUE("exec_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playbooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger_conditions" jsonb DEFAULT '{}'::jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"graph_nodes" jsonb DEFAULT '[]'::jsonb,
	"graph_edges" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"last_executed" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "activity_status" DEFAULT 'not_started' NOT NULL,
	"percent_complete" integer DEFAULT 0,
	"assigned_to" varchar,
	"start_date" timestamp,
	"end_date" timestamp,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_raci" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"team_member_id" integer NOT NULL,
	"raci_type" "raci_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_risks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"probability" "risk_probability" DEFAULT 'medium' NOT NULL,
	"impact" "risk_impact" DEFAULT 'moderate' NOT NULL,
	"risk_score" integer DEFAULT 0,
	"mitigation" text,
	"owner" varchar(255),
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_scope" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"owner_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"report_type" "report_type" DEFAULT 'executive_summary' NOT NULL,
	"period" varchar(50) NOT NULL,
	"frequency" varchar(20) NOT NULL,
	"custom_prompt" text,
	"recipient_emails" text[],
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"report_type" "report_type" DEFAULT 'executive_summary' NOT NULL,
	"period" varchar(50) NOT NULL,
	"executive_summary" text,
	"findings" jsonb,
	"recommendations" jsonb,
	"metrics" jsonb,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"file_path" text,
	"file_name" varchar(255),
	"generated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "risk_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"entity_type" "risk_entity_type" NOT NULL,
	"entity_id" integer,
	"entity_identifier" varchar(500),
	"overall_score" real DEFAULT 0 NOT NULL,
	"risk_level" varchar(20) DEFAULT 'low' NOT NULL,
	"pillar_scores" jsonb,
	"contextual_factors" jsonb,
	"risk_breakdown" jsonb,
	"compound_risk_alerts" jsonb,
	"previous_score" real,
	"score_delta" real,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" "challenge_category" NOT NULL,
	"challenge_type" "challenge_type" NOT NULL,
	"metric" varchar(100) NOT NULL,
	"target_value" integer NOT NULL,
	"xp_reward" integer NOT NULL,
	"badge_reward" varchar(100),
	"badge_icon" varchar(50),
	"difficulty" "challenge_difficulty" DEFAULT 'beginner' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"event_type" "event_type" NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"threat" varchar(500),
	"target" varchar(500),
	"attacker" varchar(500),
	"asset" varchar(500),
	"app" varchar(255),
	"description" text,
	"threat_vector" varchar(200),
	"mitre_tactic" varchar(200),
	"mitre_technique" varchar(200),
	"action" varchar(100),
	"source_type" varchar(100),
	"log_source" varchar(200),
	"sender" varchar(500),
	"recipient" varchar(500),
	"protocol" varchar(50),
	"country" varchar(100),
	"risk_score" integer,
	"raw_payload" jsonb,
	"pipeline_status" "pipeline_status" DEFAULT 'received',
	"batch_id" integer,
	"normalized_at" timestamp,
	"enriched_at" timestamp,
	"correlated_at" timestamp,
	"stored_at" timestamp,
	"sigma_matches" jsonb,
	"enriched_description" text,
	"event_hash" varchar(64),
	"parse_confidence" integer,
	"needs_review" boolean DEFAULT false,
	"ai_reasoning" text,
	"raw_log" text,
	"device_fingerprint_id" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"platform_key" varchar(100) NOT NULL,
	"platform_name" varchar(200) NOT NULL,
	"category" "integration_category" NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"api_base_url" text,
	"auth_type" varchar(50),
	"polling_enabled" boolean DEFAULT false NOT NULL,
	"polling_interval_minutes" integer DEFAULT 15,
	"last_poll_at" timestamp,
	"last_poll_status" varchar(50),
	"last_poll_message" text,
	"events_imported" integer DEFAULT 0 NOT NULL,
	"config_json" jsonb,
	"description" text,
	"logo_url" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"last_asset_sync_at" timestamp,
	"asset_sync_status" varchar(30),
	"asset_sync_message" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"auto_heal_enabled" boolean DEFAULT true NOT NULL,
	"last_heal_attempt_at" timestamp,
	"last_heal_status" varchar(50),
	"last_heal_message" text,
	CONSTRAINT "security_integrations_tenant_platform_key" UNIQUE("tenant_id","platform_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"service_type" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"msa_start_date" timestamp,
	"msa_end_date" timestamp,
	"msa_document" text,
	"contract_value" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_threat_intel" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_ioc_value" text NOT NULL,
	"ioc_type" text NOT NULL,
	"reputation" text DEFAULT 'malicious' NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"threat_type" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"contributor_count" integer DEFAULT 1 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"propagated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shift_rosters" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"team_member_id" integer NOT NULL,
	"shift_date" timestamp NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"shift_type" varchar(50) DEFAULT 'day' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sigma_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"level" varchar(50) NOT NULL,
	"category" varchar(100),
	"logsource" jsonb,
	"detection" jsonb,
	"mitre_tags" jsonb,
	"rule_yaml" text NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"last_matched_at" timestamp,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"quality_grade" varchar(5),
	"ai_suggestion" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sla_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"response_time_minutes" integer NOT NULL,
	"resolution_time_minutes" integer NOT NULL,
	"uptime_percentage" varchar(10),
	"penalty_clause" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"events_per_min" real DEFAULT 0,
	"parse_success_rate" real DEFAULT 100,
	"last_seen" timestamp,
	"error_rate" real DEFAULT 0,
	"total_events_today" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "superadmins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "superadmins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppression_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"field" varchar(100) NOT NULL,
	"operator" varchar(50) NOT NULL,
	"value" text NOT NULL,
	"action" "suppression_action" DEFAULT 'suppress' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'backlog' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"assigned_to" varchar,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taxii_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"objective" text,
	"source" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "taxii_campaigns_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taxii_malware" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"name" text NOT NULL,
	"malware_types" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"kill_chain_phases" text,
	"source" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "taxii_malware_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taxii_stix_iocs" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"indicator_type" varchar(50) NOT NULL,
	"indicator_value" text NOT NULL,
	"reputation" varchar(30) DEFAULT 'malicious',
	"confidence" integer DEFAULT 70,
	"source" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"raw_stix" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "taxii_stix_iocs_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taxii_threat_actors" (
	"id" serial PRIMARY KEY NOT NULL,
	"stix_id" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"sophistication" text,
	"primary_motivation" text,
	"country" text,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"description" text,
	"source" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "taxii_threat_actors_stix_id_unique" UNIQUE("stix_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(100),
	"team_type" "team_type" NOT NULL,
	"phone" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_ai" boolean DEFAULT false,
	"ai_specialization" varchar(50),
	"ai_personality" text,
	"ai_model" varchar(50),
	"ai_avatar" varchar(50),
	"ai_stats" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_ai_context" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"few_shot_examples" text,
	"accuracy_percent" real,
	"total_decisions" integer DEFAULT 0,
	"decisions_this_week" integer DEFAULT 0,
	"top_misclassified" jsonb,
	"last_digest_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_ai_context_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_intel_nominations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ioc_value" text NOT NULL,
	"ioc_type" text NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"reputation" text DEFAULT 'malicious' NOT NULL,
	"threat_type" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"source_incident_id" integer,
	"source_ioc_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"nominated_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"rejection_reason" text,
	"shared_threat_intel_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_intel_sharing_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"sharing_enabled" boolean DEFAULT false NOT NULL,
	"receiving_enabled" boolean DEFAULT true NOT NULL,
	"ioc_contributed" integer DEFAULT 0 NOT NULL,
	"ioc_received" integer DEFAULT 0 NOT NULL,
	"contribution_score" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_intel_sharing_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_quotas" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"tier" "quota_tier" DEFAULT 'standard' NOT NULL,
	"events_per_second" integer DEFAULT 100 NOT NULL,
	"api_requests_per_second" integer DEFAULT 50 NOT NULL,
	"storage_gb" integer DEFAULT 10 NOT NULL,
	"custom_events_per_second" integer,
	"custom_api_requests_per_second" integer,
	"custom_storage_gb" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_quotas_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_response_allowlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"risk_levels" text[] DEFAULT '{}' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_security_tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"tool_name" varchar(200) NOT NULL,
	"vendor" varchar(200) NOT NULL,
	"deployment_status" "deployment_status" DEFAULT 'deployed' NOT NULL,
	"coverage_percent" integer DEFAULT 100,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" integer NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"assigned_roles" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"type" "tenant_type" DEFAULT 'customer' NOT NULL,
	"parent_id" integer,
	"logo_url" text,
	"brand_color" varchar(20) DEFAULT '#3b82f6',
	"industry" varchar(100),
	"contact_email" varchar(255),
	"timezone" varchar(100) DEFAULT 'UTC',
	"allowed_email_domains" text[],
	"mfa_required" boolean DEFAULT false,
	"data_region" varchar(50),
	"retention_hot_days" integer DEFAULT 90,
	"retention_warm_days" integer DEFAULT 365,
	"retention_cold_days" integer DEFAULT 1095,
	"archive_storage_provider" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_name_unique" UNIQUE("name"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threat_intel_feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "feed_type" NOT NULL,
	"url" text,
	"api_key" text,
	"polling_interval" integer DEFAULT 3600,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync" timestamp,
	"last_error" text,
	"ioc_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threat_intel_iocs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"feed_id" integer,
	"indicator_type" "ioc_type" NOT NULL,
	"indicator_value" text NOT NULL,
	"reputation" "ioc_reputation" DEFAULT 'unknown' NOT NULL,
	"confidence" integer DEFAULT 50,
	"source" varchar(255),
	"first_seen" timestamp DEFAULT now(),
	"last_seen" timestamp DEFAULT now(),
	"tags" text[],
	"mitre_techniques" text[],
	"country" varchar(10),
	"context" text,
	"malware_family" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "threat_intel_iocs_tenant_type_value_source_unique" UNIQUE("tenant_id","indicator_type","indicator_value","source")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" varchar,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"sentiment" varchar(50),
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"service_id" integer,
	"title" varchar(500) NOT NULL,
	"description" text,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"category" varchar(100),
	"assigned_to" varchar,
	"created_by" varchar,
	"first_response_at" timestamp,
	"sla_breached" boolean DEFAULT false,
	"response_due_at" timestamp,
	"resolution_due_at" timestamp,
	"sla_response_breached" boolean DEFAULT false,
	"sla_resolution_breached" boolean DEFAULT false,
	"resolved_at" timestamp,
	"ai_handled" boolean DEFAULT false,
	"ai_agent_name" varchar(100),
	"ai_confidence" integer,
	"ai_escalated" boolean DEFAULT false,
	"ai_pipeline_status" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"department" varchar(255),
	"title" varchar(255),
	"total_requests" integer DEFAULT 0,
	"allowed_requests" integer DEFAULT 0,
	"denied_requests" integer DEFAULT 0,
	"isolated_requests" integer DEFAULT 0,
	"sites_visited" integer DEFAULT 0,
	"total_bytes_mb" integer DEFAULT 0,
	"downloaded_bytes_mb" integer DEFAULT 0,
	"uploaded_bytes_mb" integer DEFAULT 0,
	"risk_level" varchar(20),
	"risk_score" integer DEFAULT 0,
	"reputation" varchar(100),
	"top_sites" jsonb,
	"url_categories" varchar(1000),
	"application_names" varchar(1000),
	"linked_asset_ids" jsonb,
	"activity_data" jsonb,
	"account_type" varchar(30) DEFAULT 'Unknown',
	"source" varchar(100) DEFAULT 'import',
	"user_status" varchar(20) DEFAULT 'active',
	"last_activity" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_challenge_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"challenge_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"target_value" integer NOT NULL,
	"completed_at" timestamp,
	"claimed_at" timestamp,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_gamification_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"tenant_id" integer NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" timestamp,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vulnerability_risk_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"cve_id" text NOT NULL,
	"affected_assets" jsonb DEFAULT '[]'::jsonb,
	"affected_asset_count" integer DEFAULT 0,
	"affected_asset_groups" text[] DEFAULT '{}',
	"cvss_score" text,
	"epss_score" text,
	"exploitation_probability" integer DEFAULT 0 NOT NULL,
	"severity" text,
	"poc_available" boolean DEFAULT false,
	"exploited_in_wild" boolean DEFAULT false,
	"patch_available" boolean DEFAULT false,
	"threat_actor_names" text[] DEFAULT '{}',
	"threat_actor_details" jsonb DEFAULT '[]'::jsonb,
	"max_exposure_level" text DEFAULT 'internal',
	"ai_rationale" text,
	"patch_priority" integer,
	"estimated_risk_reduction" integer,
	"risk_trend" jsonb DEFAULT '[]'::jsonb,
	"mitre_techniques" text[] DEFAULT '{}',
	"published_date" timestamp,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_vuln_risk_tenant_cve" UNIQUE("tenant_id","cve_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_sso_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"provider" "sso_provider_type" NOT NULL,
	"display_name" varchar(100),
	"enabled" boolean DEFAULT true NOT NULL,
	"enforce_sso_only" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"allowed_domains" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_mfa_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" "mfa_device_type" NOT NULL,
	"label" varchar(100),
	"credential" jsonb,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"username" varchar(100),
	"password_hash" varchar(255),
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"mfa_enabled" boolean DEFAULT false,
	"mfa_secret" varchar(255),
	"sso_provider" varchar(50),
	"sso_external_id" varchar(255),
	"phone_number" varchar(30),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_activity_id_project_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_agent_activity_log" ADD CONSTRAINT "ai_agent_activity_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_agent_activity_log" ADD CONSTRAINT "ai_agent_activity_log_agent_id_team_members_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_detection_rules" ADD CONSTRAINT "ai_detection_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_investigations" ADD CONSTRAINT "ai_investigations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_investigations" ADD CONSTRAINT "ai_investigations_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_learning_feedback" ADD CONSTRAINT "ai_learning_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_learning_feedback" ADD CONSTRAINT "ai_learning_feedback_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_ticket_tasks" ADD CONSTRAINT "ai_ticket_tasks_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_ticket_tasks" ADD CONSTRAINT "ai_ticket_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "analyst_feedback" ADD CONSTRAINT "analyst_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "analyst_feedback" ADD CONSTRAINT "analyst_feedback_investigation_id_ai_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."ai_investigations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "analyst_feedback" ADD CONSTRAINT "analyst_feedback_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "app_category_overrides" ADD CONSTRAINT "app_category_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "asset_connections" ADD CONSTRAINT "asset_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attack_chain_groups" ADD CONSTRAINT "attack_chain_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attack_chain_groups" ADD CONSTRAINT "attack_chain_groups_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attack_detections" ADD CONSTRAINT "attack_detections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attack_detections" ADD CONSTRAINT "attack_detections_event_id_security_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."security_events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attack_detections" ADD CONSTRAINT "attack_detections_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bas_runs" ADD CONSTRAINT "bas_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bas_runs" ADD CONSTRAINT "bas_runs_scenario_id_bas_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."bas_scenarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bas_scenarios" ADD CONSTRAINT "bas_scenarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "behavior_anomalies" ADD CONSTRAINT "behavior_anomalies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "behavioral_baselines" ADD CONSTRAINT "behavioral_baselines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "case_incidents" ADD CONSTRAINT "case_incidents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "case_incidents" ADD CONSTRAINT "case_incidents_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "case_timeline" ADD CONSTRAINT "case_timeline_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cases" ADD CONSTRAINT "cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "category_confidence_thresholds" ADD CONSTRAINT "category_confidence_thresholds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cloud_app_risk_attributes" ADD CONSTRAINT "cloud_app_risk_attributes_app_score_id_cloud_app_risk_scores_id_fk" FOREIGN KEY ("app_score_id") REFERENCES "public"."cloud_app_risk_scores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cloud_app_risk_attributes" ADD CONSTRAINT "cloud_app_risk_attributes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cloud_app_risk_scores" ADD CONSTRAINT "cloud_app_risk_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_alert_notifications" ADD CONSTRAINT "community_alert_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "compliance_assessments" ADD CONSTRAINT "compliance_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crown_jewel_assets" ADD CONSTRAINT "crown_jewel_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cti_campaigns" ADD CONSTRAINT "cti_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cti_intel_reports" ADD CONSTRAINT "cti_intel_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cti_intrusion_sets" ADD CONSTRAINT "cti_intrusion_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cti_malware_families" ADD CONSTRAINT "cti_malware_families_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cti_threat_actors" ADD CONSTRAINT "cti_threat_actors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cve_risk_scores" ADD CONSTRAINT "cve_risk_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "db_connectors" ADD CONSTRAINT "db_connectors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "detection_feedback" ADD CONSTRAINT "detection_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "detection_feedback" ADD CONSTRAINT "detection_feedback_detection_id_attack_detections_id_fk" FOREIGN KEY ("detection_id") REFERENCES "public"."attack_detections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "detection_feedback" ADD CONSTRAINT "detection_feedback_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "device_posture_policies" ADD CONSTRAINT "device_posture_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "edr_cis_assessments" ADD CONSTRAINT "edr_cis_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "edr_cis_assessments" ADD CONSTRAINT "edr_cis_assessments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "edr_remediation_actions" ADD CONSTRAINT "edr_remediation_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "edr_remediation_actions" ADD CONSTRAINT "edr_remediation_actions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_configurations" ADD CONSTRAINT "email_configurations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "federated_threat_indicators" ADD CONSTRAINT "federated_threat_indicators_source_tenant_id_tenants_id_fk" FOREIGN KEY ("source_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "hunt_sessions" ADD CONSTRAINT "hunt_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "hunt_templates" ADD CONSTRAINT "hunt_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_investigation_id_ai_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."ai_investigations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_response_actions" ADD CONSTRAINT "incident_response_actions_plan_id_incident_response_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."incident_response_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_response_actions" ADD CONSTRAINT "incident_response_actions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_response_actions" ADD CONSTRAINT "incident_response_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_response_plans" ADD CONSTRAINT "incident_response_plans_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incident_response_plans" ADD CONSTRAINT "incident_response_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "incidents" ADD CONSTRAINT "incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "infrastructure_locations" ADD CONSTRAINT "infrastructure_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ingest_api_keys" ADD CONSTRAINT "ingest_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ingest_batches" ADD CONSTRAINT "ingest_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_audit_log" ADD CONSTRAINT "integration_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_heal_logs" ADD CONSTRAINT "integration_heal_logs_integration_id_security_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."security_integrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integration_heal_logs" ADD CONSTRAINT "integration_heal_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investigation_exports" ADD CONSTRAINT "investigation_exports_session_id_investigation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."investigation_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investigation_exports" ADD CONSTRAINT "investigation_exports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "investigation_sessions" ADD CONSTRAINT "investigation_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "licenses" ADD CONSTRAINT "licenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "log_sources" ADD CONSTRAINT "log_sources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_stakeholders" ADD CONSTRAINT "org_stakeholders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform_notifications" ADD CONSTRAINT "platform_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_executions" ADD CONSTRAINT "playbook_executions_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbook_executions" ADD CONSTRAINT "playbook_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_raci" ADD CONSTRAINT "project_raci_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_raci" ADD CONSTRAINT "project_raci_activity_id_project_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_raci" ADD CONSTRAINT "project_raci_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_scope" ADD CONSTRAINT "project_scope_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reports" ADD CONSTRAINT "reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "security_challenges" ADD CONSTRAINT "security_challenges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "security_integrations" ADD CONSTRAINT "security_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shift_rosters" ADD CONSTRAINT "shift_rosters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shift_rosters" ADD CONSTRAINT "shift_rosters_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sla_definitions" ADD CONSTRAINT "sla_definitions_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "source_health" ADD CONSTRAINT "source_health_source_id_log_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."log_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "source_health" ADD CONSTRAINT "source_health_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "suppression_rules" ADD CONSTRAINT "suppression_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_ai_context" ADD CONSTRAINT "tenant_ai_context_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_intel_nominations" ADD CONSTRAINT "tenant_intel_nominations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_intel_sharing_settings" ADD CONSTRAINT "tenant_intel_sharing_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_response_allowlist" ADD CONSTRAINT "tenant_response_allowlist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_security_tools" ADD CONSTRAINT "tenant_security_tools_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "threat_intel_feeds" ADD CONSTRAINT "threat_intel_feeds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "threat_intel_iocs" ADD CONSTRAINT "threat_intel_iocs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "threat_intel_iocs" ADD CONSTRAINT "threat_intel_iocs_feed_id_threat_intel_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."threat_intel_feeds"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_feedback" ADD CONSTRAINT "ticket_feedback_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_challenge_id_security_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."security_challenges"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_challenge_progress" ADD CONSTRAINT "user_challenge_progress_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_gamification_profiles" ADD CONSTRAINT "user_gamification_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vulnerability_risk_scores" ADD CONSTRAINT "vulnerability_risk_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN undefined_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_response_allowlist_uniq" ON "tenant_response_allowlist" USING btree ("tenant_id","action_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");
--> statement-breakpoint