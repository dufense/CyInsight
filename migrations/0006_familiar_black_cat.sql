CREATE TYPE "public"."risk_entity_type" AS ENUM('asset', 'user', 'ip', 'domain');--> statement-breakpoint
CREATE TABLE "compliance_assessments" (
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
CREATE TABLE "risk_scores" (
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
ALTER TABLE "tenants" ADD COLUMN "allowed_email_domains" text[];--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "mfa_required" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" varchar(255);--> statement-breakpoint
ALTER TABLE "compliance_assessments" ADD CONSTRAINT "compliance_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;