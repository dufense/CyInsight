CREATE TABLE IF NOT EXISTS "bas_scenarios" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "mitre_attack_ids" text[] DEFAULT '{}',
  "kill_chain_phases" text[] DEFAULT '{}',
  "severity" text NOT NULL DEFAULT 'medium',
  "attack_vectors" jsonb DEFAULT '[]',
  "is_built_in" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bas_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scenario_id" integer NOT NULL REFERENCES "bas_scenarios"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "triggered_by" text,
  "started_at" timestamp,
  "completed_at" timestamp,
  "overall_score" integer,
  "detection_score" integer,
  "prevention_score" integer,
  "exposure_score" integer,
  "results" jsonb DEFAULT '[]',
  "ai_analysis" text,
  "recommendations" jsonb DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL
);
