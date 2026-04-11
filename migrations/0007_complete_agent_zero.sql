CREATE TYPE "public"."ingest_batch_status" AS ENUM('queued', 'normalizing', 'enriching', 'scoring', 'correlating', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ingest_channel" AS ENUM('api', 'file', 'connector');--> statement-breakpoint
CREATE TABLE "cloud_app_risk_attributes" (
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
CREATE TABLE "cloud_app_risk_scores" (
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
CREATE TABLE "ingest_api_keys" (
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
CREATE TABLE "ingest_batches" (
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
ALTER TABLE "documents" ADD COLUMN "source_product" varchar(200);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "doc_type" varchar(100);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "generated_version" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "is_auto_generated" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "official_urls" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "stale_days" integer DEFAULT 90;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "dedup_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "cloud_app_risk_attributes" ADD CONSTRAINT "cloud_app_risk_attributes_app_score_id_cloud_app_risk_scores_id_fk" FOREIGN KEY ("app_score_id") REFERENCES "public"."cloud_app_risk_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_app_risk_attributes" ADD CONSTRAINT "cloud_app_risk_attributes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_app_risk_scores" ADD CONSTRAINT "cloud_app_risk_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_api_keys" ADD CONSTRAINT "ingest_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_batches" ADD CONSTRAINT "ingest_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;