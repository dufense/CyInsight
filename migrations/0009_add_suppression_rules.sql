DO $$ BEGIN
  CREATE TYPE "public"."suppression_action" AS ENUM('suppress', 'deprioritize');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
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
DO $$ BEGIN
  ALTER TABLE "suppression_rules"
    ADD CONSTRAINT "suppression_rules_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppression_rules_tenant_id_idx" ON "suppression_rules" ("tenant_id");
