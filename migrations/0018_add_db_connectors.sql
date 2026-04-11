DO $$ BEGIN
  CREATE TYPE "public"."db_connector_type" AS ENUM(
    'postgresql','mysql','mariadb','mssql','clickhouse','timescaledb',
    'snowflake','bigquery','redshift','databricks','iceberg'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
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
DO $$ BEGIN
  ALTER TABLE "db_connectors"
    ADD CONSTRAINT "db_connectors_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "db_connectors_tenant_id_idx" ON "db_connectors" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "db_connectors_status_idx" ON "db_connectors" ("status");
--> statement-breakpoint
ALTER TABLE "data_retention_policies"
  ADD COLUMN IF NOT EXISTS "warm_connector_id" integer,
  ADD COLUMN IF NOT EXISTS "cold_connector_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "data_retention_policies"
    ADD CONSTRAINT "drp_warm_connector_fk"
    FOREIGN KEY ("warm_connector_id") REFERENCES "public"."db_connectors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "data_retention_policies"
    ADD CONSTRAINT "drp_cold_connector_fk"
    FOREIGN KEY ("cold_connector_id") REFERENCES "public"."db_connectors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drp_warm_connector_idx" ON "data_retention_policies" ("warm_connector_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drp_cold_connector_idx" ON "data_retention_policies" ("cold_connector_id");
