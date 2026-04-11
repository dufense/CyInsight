CREATE TYPE "public"."activity_status" AS ENUM('not_started', 'in_progress', 'completed', 'delayed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."raci_type" AS ENUM('responsible', 'accountable', 'consulted', 'informed');--> statement-breakpoint
CREATE TYPE "public"."risk_impact" AS ENUM('negligible', 'minor', 'moderate', 'major', 'severe');--> statement-breakpoint
CREATE TYPE "public"."risk_probability" AS ENUM('very_low', 'low', 'medium', 'high', 'very_high');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'mitigating', 'accepted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('inclusion', 'exclusion');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"activity_id" integer,
	"description" text NOT NULL,
	"log_type" varchar(50) DEFAULT 'update' NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activities" (
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
CREATE TABLE "project_raci" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"team_member_id" integer NOT NULL,
	"raci_type" "raci_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_risks" (
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
CREATE TABLE "project_scope" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
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
ALTER TABLE "assets" ADD COLUMN "bios_serial_number" varchar(255);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "processor" varchar(500);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "total_physical_memory" varchar(100);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "storage_info" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "system_model" varchar(500);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "system_manufacturer" varchar(255);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "device_health" varchar(100);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "last_logged_in_user" varchar(255);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "software_inventory" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "response_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_response_breached" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "sla_resolution_breached" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_activity_id_project_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_raci" ADD CONSTRAINT "project_raci_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_raci" ADD CONSTRAINT "project_raci_activity_id_project_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_raci" ADD CONSTRAINT "project_raci_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_risks" ADD CONSTRAINT "project_risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_scope" ADD CONSTRAINT "project_scope_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;