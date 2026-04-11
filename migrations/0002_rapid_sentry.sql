CREATE TYPE "public"."integration_category" AS ENUM('edr_xdr', 'sse_casb', 'dlp', 'email_security', 'waf', 'tip_easm', 'vulnerability_management', 'directory_services', 'network_security', 'endpoint_security', 'siem', 'soar', 'other');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'disconnected', 'error', 'configuring', 'disabled');--> statement-breakpoint
CREATE TABLE "security_integrations" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_integrations" ADD CONSTRAINT "security_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;